// Fork-owned: disableMobilePairing on the WebSocket dispatcher. A phone paired before the policy landed keeps a
// valid token, so refusing only new pairing offers would leave it connected; v1.4.224 rewrote the
// spot this refusal sits in (RpcCallerScope) and the switch's consumer floor could not see it go.

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { OrcaRuntimeRpcServer } from './runtime-rpc'
import { DeviceRegistry } from './device-registry'
import { createMobileRpcSurfaceRuntime } from './runtime-rpc-mobile-method-allowlist-fixtures'

const mocks = vi.hoisted(() => ({ getEnterprisePolicy: vi.fn() }))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

async function statusFromPairedPhone(): Promise<Record<string, unknown>> {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-mobile-pairing-policy-'))
  const { runtime } = createMobileRpcSurfaceRuntime()
  const server = new OrcaRuntimeRpcServer({ runtime, userDataPath, enableWebSocket: false })
  server['deviceRegistry'] = new DeviceRegistry(userDataPath)
  const phone = server['deviceRegistry']!.addDevice('phone', 'mobile')
  const replies: Record<string, unknown>[] = []
  await server['handleWebSocketMessage'](
    JSON.stringify({ id: 'req_status', method: 'status.get', deviceToken: phone.token }),
    (response) => replies.push(JSON.parse(response) as Record<string, unknown>),
    () => {}
  )
  return replies[0]
}

describe('a paired phone under the corporate mobile pairing switch', () => {
  beforeEach(() => {
    mocks.getEnterprisePolicy.mockReset()
  })

  it('refuses every request from a phone paired before the policy', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())

    await expect(statusFromPairedPhone()).resolves.toMatchObject({
      ok: false,
      error: { code: 'forbidden' }
    })
  })

  it('serves the paired phone when the policy allows mobile pairing', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())

    await expect(statusFromPairedPhone()).resolves.toMatchObject({ ok: true })
  })
})

// v1.4.226 lets a paired desktop relay its phones to a runtime host, which mints each a token;
// without this gate a host under the policy would hand phone credentials to a paired desktop.
describe('phones a paired runtime relays under the corporate mobile pairing switch', () => {
  beforeEach(() => {
    mocks.getEnterprisePolicy.mockReset()
  })

  function pairedRuntimeHost() {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-delegated-phone-policy-'))
    const { runtime, mocks: runtimeDouble } = createMobileRpcSurfaceRuntime()
    // Revoking a phone also drops its navigation state, which the mobile-surface double omits.
    Object.assign(runtimeDouble, { forgetClientNavigationState: vi.fn() })
    const server = new OrcaRuntimeRpcServer({ runtime, userDataPath, enableWebSocket: false })
    const registry = new DeviceRegistry(userDataPath)
    server['deviceRegistry'] = registry
    const desktop = registry.addDevice('desktop', 'runtime')
    const sync = (phones: { phoneKey: string; name: string }[]) =>
      server['syncDelegatedMobileDevices'](desktop.deviceId, phones)
    return { registry, desktop, sync }
  }

  it('mints a token for each relayed phone when the policy allows mobile pairing', () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
    const { registry, desktop, sync } = pairedRuntimeHost()

    expect(sync([{ phoneKey: 'phone-1', name: 'Phone' }]).devices).toHaveLength(1)
    expect(registry.listDelegatedMobileDevices(desktop.deviceId)).toHaveLength(1)
  })

  it('mints nothing and revokes phones relayed before the policy', () => {
    const { registry, desktop, sync } = pairedRuntimeHost()
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
    sync([{ phoneKey: 'phone-1', name: 'Phone' }])

    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())

    expect(sync([{ phoneKey: 'phone-1', name: 'Phone' }]).devices).toEqual([])
    expect(registry.listDelegatedMobileDevices(desktop.deviceId)).toEqual([])
  })
})

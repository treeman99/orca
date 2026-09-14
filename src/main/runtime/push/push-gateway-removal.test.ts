import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const gatewayClientConstructed = vi.hoisted(() => vi.fn())
vi.mock('./push-gateway-client', () => ({
  PushGatewayClient: class {
    constructor(options: unknown) {
      gatewayClientConstructed(options)
    }
  }
}))

import { DeviceRegistry } from '../device-registry'
import { DesktopPushService } from './desktop-push-service'
import { createPushHostKeypair } from './push-host-challenge-fixtures'
import { PushUnregisterOutbox } from './push-unregister-outbox'
import { resolvePushGatewayOrigin } from './push-gateway-origin'

function createFromResolvedOrigin(env: NodeJS.ProcessEnv, packaged: boolean) {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-push-removal-'))
  const registry = new DeviceRegistry(userDataPath)
  registry.addDevice('phone', 'mobile')
  return DesktopPushService.create({
    runtime: { setMobilePushRegistrar: vi.fn(), onNotificationDispatched: vi.fn() } as never,
    runtimeRpc: {
      getE2EEKeypair: () => createPushHostKeypair(),
      getDeviceRegistry: () => registry,
      getPushUnregisterOutbox: () => new PushUnregisterOutbox(userDataPath),
      setOnPushUnregisterQueued: vi.fn()
    } as never,
    gatewayUrl: resolvePushGatewayOrigin(env, packaged)
  })
}

describe('removed vendor push gateway', () => {
  it.each([true, false])(
    'resolves no origin, even with an env override (packaged=%s)',
    (packaged) => {
      expect(resolvePushGatewayOrigin({}, packaged)).toBe('')
      expect(
        resolvePushGatewayOrigin({ ORCA_PUSH_GATEWAY_URL: 'https://push.gateway.test' }, packaged)
      ).toBe('')
    }
  )

  it('builds no push service and no gateway client for a paired phone', () => {
    const service = createFromResolvedOrigin(
      { ORCA_PUSH_GATEWAY_URL: 'https://push.gateway.test' },
      true
    )
    expect(service).toBeNull()
    expect(gatewayClientConstructed).not.toHaveBeenCalled()
  })
})

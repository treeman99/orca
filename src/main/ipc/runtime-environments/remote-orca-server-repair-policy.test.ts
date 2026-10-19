/**
 * `disableRemoteOrcaServer` on the v1.4.230 re-pair channel (`runtimeEnvironments:repairFromPairingCode`).
 *
 * Why its own suite: re-pairing dials the pasted link's host with Node `ws` before it checks the
 * server key, outside the Electron session the network allowlist sees, so the policy is the
 * only thing between a saved record and an outbound socket.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../../shared/enterprise-policy-fixture'

const {
  handleMock,
  onMock,
  removeHandlerMock,
  removeAllListenersMock,
  getPathMock,
  getEnterprisePolicyMock,
  sendRemoteRuntimeRequestMock
} = vi.hoisted(() => ({
  handleMock: vi.fn(),
  onMock: vi.fn(),
  removeHandlerMock: vi.fn(),
  removeAllListenersMock: vi.fn(),
  getPathMock: vi.fn(),
  getEnterprisePolicyMock: vi.fn(),
  sendRemoteRuntimeRequestMock: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: getPathMock },
  ipcMain: {
    handle: handleMock,
    on: onMock,
    removeHandler: removeHandlerMock,
    removeAllListeners: removeAllListenersMock
  }
}))

vi.mock('../../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

vi.mock('../../../shared/remote-runtime-client', () => ({
  sendRemoteRuntimeRequest: sendRemoteRuntimeRequestMock,
  subscribeRemoteRuntimeRequest: vi.fn()
}))

vi.mock('./runtime-environment-request-connections', async () => {
  const { withRuntimeStatusOwners } = await import('./runtime-environments-ipc-test-harness')
  return withRuntimeStatusOwners({
    sendRemoteRuntimeConnectionRequest: vi.fn(),
    sendRemoteRuntimeSharedControlRequest: vi.fn(() => new Promise(() => {})),
    subscribeRemoteRuntimeSharedControlRequest: vi.fn(),
    getRemoteRuntimeSharedControlDiagnostics: vi.fn(() => null),
    reconnectRemoteRuntimeSharedControlConnection: vi.fn(),
    retryRemoteRuntimeSharedControlConnectionsNow: vi.fn(),
    retryRemoteRuntimeSharedControlConnectionNow: vi.fn(),
    ensureRemoteRuntimeSharedControlConnection: vi.fn(),
    pauseRemoteRuntimeSharedControlRetry: vi.fn(),
    closeRemoteRuntimeRequestConnection: vi.fn()
  })
})

import { REMOTE_ORCA_SERVER_DISABLED_BY_POLICY } from '../../enterprise/remote-orca-server-guard'
import { registerRuntimeEnvironmentHandlers } from './runtime-environments'
import { channelHandlerLookup, pairingCode } from './runtime-environments-ipc-test-harness'

const handler = channelHandlerLookup(handleMock)
// Not loopback: the verifier refuses a loopback link for a non-tunnel server before dialing.
const LAN_LINK = pairingCode('ws://10.20.30.40:6768')

describe('runtimeEnvironments:repairFromPairingCode under the enterprise policy', () => {
  let userDataPath: string
  let store: { getSettings: () => { activeRuntimeEnvironmentId: string | null } }

  async function savedEnvironmentRepair(): Promise<() => Promise<unknown>> {
    registerRuntimeEnvironmentHandlers(store as never)
    const add = handler<{ name: string; pairingCode: string }, { environment: { id: string } }>(
      'runtimeEnvironments:addFromPairingCode'
    )
    await add(null, { name: 'desk', pairingCode: LAN_LINK })
    const repair = handler<{ selector: string; pairingCode: string }, unknown>(
      'runtimeEnvironments:repairFromPairingCode'
    )
    return async () => repair(null, { selector: 'desk', pairingCode: LAN_LINK })
  }

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'orca-repair-policy-'))
    store = { getSettings: () => ({ activeRuntimeEnvironmentId: null }) }
    getPathMock.mockReset().mockReturnValue(userDataPath)
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
    handleMock.mockReset()
    onMock.mockReset()
    removeHandlerMock.mockReset()
    removeAllListenersMock.mockReset()
    sendRemoteRuntimeRequestMock
      .mockReset()
      .mockResolvedValue({ ok: false, error: { code: 'unauthorized', message: 'no' } })
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
  })

  it('refuses to dial the pasted link when the policy disables remote Orca servers', async () => {
    // Saved while the policy allowed it, as a record from before the policy landed would be.
    const repair = await savedEnvironmentRepair()
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    await expect(repair()).rejects.toThrow(REMOTE_ORCA_SERVER_DISABLED_BY_POLICY)
    expect(sendRemoteRuntimeRequestMock).not.toHaveBeenCalled()
  })

  it('dials the pasted link when no policy applies', async () => {
    const repair = await savedEnvironmentRepair()

    await repair()

    expect(sendRemoteRuntimeRequestMock).toHaveBeenCalledTimes(1)
  })
})

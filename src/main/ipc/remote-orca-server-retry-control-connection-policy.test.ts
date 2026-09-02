/**
 * `disableRemoteOrcaServer` on the single-environment control-connection retry channel.
 *
 * Why its own suite: `remote-orca-server-policy.test.ts` covers the three transport chokepoints
 * that open an outbound socket. This channel opens none — it only nudges a connection the cache
 * already holds — so its gate has to be pinned at the IPC handler instead.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const {
  handleMock,
  onMock,
  removeHandlerMock,
  removeAllListenersMock,
  getPathMock,
  getEnterprisePolicyMock,
  retryRemoteRuntimeSharedControlConnectionNowMock
} = vi.hoisted(() => ({
  handleMock: vi.fn(),
  onMock: vi.fn(),
  removeHandlerMock: vi.fn(),
  removeAllListenersMock: vi.fn(),
  getPathMock: vi.fn(),
  getEnterprisePolicyMock: vi.fn(),
  retryRemoteRuntimeSharedControlConnectionNowMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: getPathMock },
  ipcMain: {
    handle: handleMock,
    on: onMock,
    removeHandler: removeHandlerMock,
    removeAllListeners: removeAllListenersMock
  }
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

vi.mock('../../shared/remote-runtime-client', () => ({
  sendRemoteRuntimeRequest: vi.fn(),
  subscribeRemoteRuntimeRequest: vi.fn()
}))

vi.mock('./runtime-environment-request-connections', () => ({
  sendRemoteRuntimeConnectionRequest: vi.fn(),
  sendRemoteRuntimeSharedControlRequest: vi.fn(),
  subscribeRemoteRuntimeSharedControlRequest: vi.fn(),
  getRemoteRuntimeSharedControlDiagnostics: vi.fn(() => null),
  reconnectRemoteRuntimeSharedControlConnection: vi.fn(),
  retryRemoteRuntimeSharedControlConnectionsNow: vi.fn(),
  retryRemoteRuntimeSharedControlConnectionNow: retryRemoteRuntimeSharedControlConnectionNowMock,
  ensureRemoteRuntimeSharedControlConnection: vi.fn(),
  pauseRemoteRuntimeSharedControlRetry: vi.fn(),
  closeRemoteRuntimeRequestConnection: vi.fn()
}))

import { REMOTE_ORCA_SERVER_DISABLED_BY_POLICY } from '../enterprise/remote-orca-server-guard'
import { registerRuntimeEnvironmentHandlers } from './runtime-environments'
import { channelHandlerLookup, pairingCode } from './runtime-environments-ipc-test-harness'

const handler = channelHandlerLookup(handleMock)

describe('runtimeEnvironments:retryControlConnection under the enterprise policy', () => {
  let userDataPath: string
  let store: { getSettings: () => { activeRuntimeEnvironmentId: string | null } }

  async function addEnvironmentAndRetry(): Promise<() => Promise<void>> {
    registerRuntimeEnvironmentHandlers(store as never)
    const add = handler<{ name: string; pairingCode: string }, { environment: { id: string } }>(
      'runtimeEnvironments:addFromPairingCode'
    )
    await add(null, { name: 'desk', pairingCode: pairingCode() })
    const retry = handler<{ selector: string }, void>('runtimeEnvironments:retryControlConnection')
    return async () => {
      await retry(null, { selector: 'desk' })
    }
  }

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'orca-retry-control-policy-'))
    store = { getSettings: () => ({ activeRuntimeEnvironmentId: null }) }
    getPathMock.mockReset().mockReturnValue(userDataPath)
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
    handleMock.mockReset()
    onMock.mockReset()
    removeHandlerMock.mockReset()
    removeAllListenersMock.mockReset()
    retryRemoteRuntimeSharedControlConnectionNowMock.mockReset()
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
  })

  it('refuses the retry when the policy disables remote Orca servers', async () => {
    // Pair while the policy still allows it, so the refusal under test is the retry's own gate
    // and not a side effect of the pairing channel being blocked.
    const retry = await addEnvironmentAndRetry()
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    await expect(retry()).rejects.toThrow(REMOTE_ORCA_SERVER_DISABLED_BY_POLICY)
    expect(retryRemoteRuntimeSharedControlConnectionNowMock).not.toHaveBeenCalled()
  })

  it('advances the retry when no policy applies', async () => {
    const retry = await addEnvironmentAndRetry()

    await retry()

    expect(retryRemoteRuntimeSharedControlConnectionNowMock).toHaveBeenCalledTimes(1)
  })
})

/**
 * `disableRemoteOrcaServer` on the status probes v1.4.201 moved into the runtime host status owner.
 *
 * Why its own suite: that release added a boot loop that activates a status owner for every saved
 * remote Orca, and the owner dials `status.get` itself — neither passes the three transport entry
 * points `remote-orca-server-policy.test.ts` pins.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  getPath: vi.fn(),
  getEnterprisePolicy: vi.fn(),
  sendRemoteRuntimeRequest: vi.fn(),
  sendRemoteRuntimeSharedControlRequest: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: mocks.getPath },
  ipcMain: {
    handle: mocks.handle,
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn()
  }
}))
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))
vi.mock('../../shared/remote-runtime-client', () => ({
  sendRemoteRuntimeRequest: mocks.sendRemoteRuntimeRequest,
  subscribeRemoteRuntimeRequest: vi.fn()
}))
vi.mock('./runtime-environment-request-connections', async () => {
  const { withRuntimeStatusOwners } = await import('./runtime-environments-ipc-test-harness')
  return withRuntimeStatusOwners({
    sendRemoteRuntimeConnectionRequest: vi.fn(),
    sendRemoteRuntimeSharedControlRequest: mocks.sendRemoteRuntimeSharedControlRequest,
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

import {
  addEnvironmentFromPairingCode,
  resolveEnvironment
} from '../../shared/runtime-environment-store'
import { REMOTE_ORCA_SERVER_DISABLED_BY_POLICY } from '../enterprise/remote-orca-server-guard'
import {
  getRuntimeEnvironmentStatusSnapshots,
  resetRuntimeEnvironmentStatusOwners
} from './runtime-environment-request-connections'
import { createRuntimeEnvironmentStatusOwner } from './runtime-environment-status-owner'
import { registerRuntimeEnvironmentHandlers } from './runtime-environments'
import { pairingCode } from './runtime-environments-ipc-test-harness'

describe('remote Orca status probes under the enterprise policy', () => {
  let userDataPath: string
  const store = { getSettings: () => ({ activeRuntimeEnvironmentId: null }) }

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'orca-boot-probe-policy-'))
    mocks.getPath.mockReset().mockReturnValue(userDataPath)
    mocks.getEnterprisePolicy.mockReset().mockReturnValue(makeLockdownPolicy())
    mocks.handle.mockReset()
    mocks.sendRemoteRuntimeRequest.mockReset().mockReturnValue(new Promise(() => {}))
    mocks.sendRemoteRuntimeSharedControlRequest.mockReset().mockReturnValue(new Promise(() => {}))
    addEnvironmentFromPairingCode(userDataPath, { name: 'desk', pairingCode: pairingCode() })
  })

  afterEach(() => {
    resetRuntimeEnvironmentStatusOwners()
    rmSync(userDataPath, { recursive: true, force: true })
  })

  it('does not start a boot status owner for a saved remote Orca', () => {
    registerRuntimeEnvironmentHandlers(store as never)

    expect(getRuntimeEnvironmentStatusSnapshots()).toEqual([])
    expect(mocks.sendRemoteRuntimeRequest).not.toHaveBeenCalled()
  })

  it('refuses the probe inside the status owner, whatever activates it', async () => {
    const request = vi.fn()
    const owner = createRuntimeEnvironmentStatusOwner(
      userDataPath,
      resolveEnvironment(userDataPath, 'desk'),
      { isReady: () => false, request, establish: vi.fn(), pause: vi.fn() }
    )

    await expect(owner.refresh()).resolves.toMatchObject({
      ok: false,
      error: { code: REMOTE_ORCA_SERVER_DISABLED_BY_POLICY }
    })
    expect(request).not.toHaveBeenCalled()
    expect(mocks.sendRemoteRuntimeRequest).not.toHaveBeenCalled()
    owner.dispose()
  })

  it('probes the saved remote Orca at boot when no policy applies', () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())

    registerRuntimeEnvironmentHandlers(store as never)

    expect(getRuntimeEnvironmentStatusSnapshots()).toHaveLength(1)
    expect(mocks.sendRemoteRuntimeRequest).toHaveBeenCalledWith(
      expect.anything(),
      'status.get',
      undefined,
      15_000,
      undefined,
      expect.anything(),
      expect.anything()
    )
  })
})

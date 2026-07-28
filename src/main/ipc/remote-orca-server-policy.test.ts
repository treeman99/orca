import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../enterprise/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

const remote = vi.hoisted(() => ({
  sendRemoteRuntimeRequest: vi.fn(),
  subscribeRemoteRuntimeRequest: vi.fn()
}))
vi.mock('../../shared/remote-runtime-client', () => remote)

const store = vi.hoisted(() => ({
  resolveEnvironment: vi.fn(() => ({ id: 'env-1', runtimeId: 'rt-1', createdAt: 1 })),
  markEnvironmentUsed: vi.fn()
}))
vi.mock('../../shared/runtime-environment-store', () => store)

vi.mock('../../shared/runtime-environments', () => ({
  getPreferredPairingOffer: () => ({
    endpoint: 'ws://10.0.0.5:6768',
    deviceToken: 't',
    publicKeyB64: 'k'
  })
}))

import {
  callRuntimeEnvironment,
  getRuntimeEnvironmentStatus,
  subscribeRuntimeEnvironment
} from './runtime-environment-transport-routing'
import { REMOTE_ORCA_SERVER_DISABLED_BY_POLICY } from '../enterprise/remote-orca-server-guard'

const callbacks = { onEvent: () => {}, onClose: () => {} }

describe('remote Orca runtimes under the enterprise policy', () => {
  beforeEach(() => {
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
    remote.sendRemoteRuntimeRequest.mockReset().mockResolvedValue({
      ok: true,
      result: { capabilities: [] },
      _meta: { runtimeId: 'rt-1' }
    })
    remote.subscribeRemoteRuntimeRequest
      .mockReset()
      .mockResolvedValue({ requestId: 'r', close() {} })
  })

  describe('when the policy disables remote Orca servers', () => {
    beforeEach(() => {
      getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    })

    // These three are the only ways an outbound socket to another Orca is opened.
    it('opens no socket for a status probe', async () => {
      await expect(getRuntimeEnvironmentStatus('/data', 'env-1')).resolves.toMatchObject({
        ok: false,
        error: { code: REMOTE_ORCA_SERVER_DISABLED_BY_POLICY }
      })
      expect(remote.sendRemoteRuntimeRequest).not.toHaveBeenCalled()
    })

    it('opens no socket for a call', async () => {
      await expect(
        callRuntimeEnvironment('/data', 'env-1', 'files.read', {})
      ).resolves.toMatchObject({
        ok: false,
        error: { code: REMOTE_ORCA_SERVER_DISABLED_BY_POLICY }
      })
      expect(remote.sendRemoteRuntimeRequest).not.toHaveBeenCalled()
    })

    it('opens no socket for a subscription', async () => {
      await expect(
        subscribeRuntimeEnvironment('/data', 'env-1', 'files.watch', {}, undefined, callbacks)
      ).rejects.toThrow(REMOTE_ORCA_SERVER_DISABLED_BY_POLICY)
      expect(remote.subscribeRemoteRuntimeRequest).not.toHaveBeenCalled()
    })
  })

  it('reaches the remote runtime when no policy applies', async () => {
    await getRuntimeEnvironmentStatus('/data', 'env-1')
    expect(remote.sendRemoteRuntimeRequest).toHaveBeenCalled()
  })

  // The switch is scoped to the outbound Orca-to-Orca lane; SSH hosts and the inbound
  // `orca serve` listener are separate features and must not be collateral damage.
  it('is not implied by the other lockdown switches on their own', async () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeEnterprisePolicy({ disableCloudRelay: true, disableMobilePairing: true })
    )
    await getRuntimeEnvironmentStatus('/data', 'env-1')
    expect(remote.sendRemoteRuntimeRequest).toHaveBeenCalled()
  })
})

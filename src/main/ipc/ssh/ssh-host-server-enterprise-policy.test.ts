// disableRemoteOrcaServer over the managed-orcad lane. A managed server is an Orca server on the
// remote host, out of reach of this machine's policy file, so under the policy the deploy and
// convert chokepoints refuse before touching the host. (v1.4.226 deleted the SSH relay; this build
// also removes SSH hosts outright — ssh-remote-hosts-removal.test.ts — so these are the second wall.)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../../shared/enterprise-policy-fixture'
import type * as SshTargetRegistry from '../../ssh/ssh-target-registry'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  resolve: vi.fn(),
  runTargetLifecycle: vi.fn(),
  requireManagedOrcadInfrastructure: vi.fn()
}))
vi.mock('../../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))
vi.mock('../../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => '/tmp/user-data', getVersion: () => '1.5.0' })
}))
vi.mock('../../ssh/ssh-target-registry', async (importOriginal) => ({
  ...(await importOriginal<typeof SshTargetRegistry>()),
  getSshTargetRegistryStore: () => ({ getTarget: () => null })
}))
vi.mock('../../ssh/ssh-host-server-on-connect', () => ({
  resolveHostServerOnConnect: mocks.resolve
}))
vi.mock('./ssh-host-server-on-connect-wiring', () => ({ hostServerOnConnectDeps: () => ({}) }))
vi.mock('./ssh-ipc-context', () => ({ connectionManager: null, getCurrentMainWindow: () => null }))
vi.mock('./ssh-renderer-broadcast', () => ({
  broadcastSshState: vi.fn(),
  clearRelayStateOverride: vi.fn(),
  getPublicSshState: vi.fn()
}))
vi.mock('./ssh-target-lifecycle-queue', () => ({ runTargetLifecycle: mocks.runTargetLifecycle }))
vi.mock('../../managed-server/lifecycle/orcad-managed-runtime-context', () => ({
  isForceableOrcadDeferral: () => false,
  managedOrcadSlot: vi.fn(),
  probeManagedOrcadReadiness: vi.fn(),
  requireManagedOrcadInfrastructure: mocks.requireManagedOrcadInfrastructure
}))

const { createManagedOrcadEnvironment } =
  await import('../../managed-server/lifecycle/orcad-runtime-deployment')
const { convertSshTargetToManagedOrcad } =
  await import('../../managed-server/lifecycle/orcad-runtime-conversion')
const { deployOrcad } = await import('../../ssh/orcad-remote-deploy')
const { wslHostsGateOpen } = await import('../../wsl/wsl-host-gate')

const REFUSED = 'remote_orca_server_disabled_by_policy'
const conversion: Parameters<typeof convertSshTargetToManagedOrcad>[1] = {
  sshTargetId: 'ssh-1',
  name: 'box',
  destinationFor: () => {
    throw new Error('no destination in this test')
  },
  releaseDirectSession: async () => {}
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockResolvedValue({ route: 'relay', reason: 'orcad_unavailable' })
  mocks.runTargetLifecycle.mockRejectedValue(new Error('lifecycle stubbed out'))
  mocks.requireManagedOrcadInfrastructure.mockImplementation(() => {
    throw new Error('infrastructure stubbed out')
  })
})

describe('the managed Orca server SSH lane under the corporate policy', () => {
  it('refuses a deploy before it queues any host lifecycle work under lockdown', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())

    await expect(
      createManagedOrcadEnvironment('/tmp/user-data', { name: 'box', sshTargetId: 'ssh-1' })
    ).rejects.toThrow(REFUSED)
    expect(mocks.runTargetLifecycle).not.toHaveBeenCalled()
  })

  it('queues a deploy when the policy allows remote Orca servers', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())

    await expect(
      createManagedOrcadEnvironment('/tmp/user-data', { name: 'box', sshTargetId: 'ssh-1' })
    ).rejects.toThrow('lifecycle stubbed out')
    expect(mocks.runTargetLifecycle).toHaveBeenCalledTimes(1)
  })

  it('refuses a conversion before fencing the relay host under lockdown', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())

    await expect(convertSshTargetToManagedOrcad('/tmp/user-data', conversion)).rejects.toThrow(
      REFUSED
    )
    expect(mocks.requireManagedOrcadInfrastructure).not.toHaveBeenCalled()
  })

  it('starts a conversion when the policy allows remote Orca servers', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())

    await expect(convertSshTargetToManagedOrcad('/tmp/user-data', conversion)).rejects.toThrow(
      'infrastructure stubbed out'
    )
    expect(mocks.requireManagedOrcadInfrastructure).toHaveBeenCalledTimes(1)
  })

  // v1.4.226's WSL hosts call deployOrcad directly, past the wrapper above, so the deploy itself
  // carries the refusal.
  it('refuses a direct orcad deploy under lockdown', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())

    await expect(deployOrcad({ target: 'linux-x64-glibc' } as never)).rejects.toThrow(REFUSED)
  })

  it('keeps the env-opened WSL host gate closed under lockdown', () => {
    vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', '1')
    try {
      mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
      expect(wslHostsGateOpen()).toBe(true)
      mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())
      expect(wslHostsGateOpen()).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

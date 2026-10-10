// disableRemoteOrcaServer over the v1.4.224 managed-orcad SSH lane. A managed server is an Orca
// server on the remote host, out of reach of this machine's policy file, so under the policy the
// connect keeps the relay and the deploy/convert chokepoints refuse before touching the host.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import type { SshTarget } from '../../shared/ssh-types'
import type * as SshTargetRegistry from '../ssh/ssh-target-registry'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  resolve: vi.fn(),
  runTargetLifecycle: vi.fn(),
  requireManagedOrcadInfrastructure: vi.fn()
}))
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))
vi.mock('../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => '/tmp/user-data', getVersion: () => '1.5.0' })
}))
vi.mock('../ssh/ssh-target-registry', async (importOriginal) => ({
  ...(await importOriginal<typeof SshTargetRegistry>()),
  getSshTargetRegistryStore: () => ({ getTarget: () => null })
}))
vi.mock('../ssh/ssh-host-server-on-connect', () => ({
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
vi.mock('../ssh/orcad-managed-runtime-context', () => ({
  isForceableOrcadDeferral: () => false,
  managedOrcadSlot: vi.fn(),
  probeManagedOrcadReadiness: vi.fn(),
  requireManagedOrcadInfrastructure: mocks.requireManagedOrcadInfrastructure
}))

const { decideHostServer } = await import('./ssh-host-server-connect')
const { createManagedOrcadEnvironment } = await import('../ssh/orcad-runtime-deployment')
const { convertSshTargetToManagedOrcad } = await import('../ssh/orcad-runtime-conversion')

const target: SshTarget = { id: 'ssh-1', label: 'Box', host: 'box', port: 22, username: 'me' }
const REFUSED = 'remote_orca_server_disabled_by_policy'
const conversion: Parameters<typeof convertSshTargetToManagedOrcad>[1] = {
  sshTargetId: 'ssh-1',
  name: 'box',
  listRelayPtyIds: null,
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
  it('keeps the relay without deciding a managed server under lockdown', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())

    await expect(decideHostServer(target)).resolves.toBeNull()
    expect(mocks.resolve).not.toHaveBeenCalled()
  })

  it('decides the host server when the policy allows remote Orca servers', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())

    await expect(decideHostServer(target)).resolves.toEqual({
      route: 'relay',
      reason: 'orcad_unavailable'
    })
    expect(mocks.resolve).toHaveBeenCalledTimes(1)
  })

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
})

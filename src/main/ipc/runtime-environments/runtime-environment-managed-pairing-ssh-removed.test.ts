// Fork-owned: v1.4.232 re-pairs a server managed over SSH when it refuses this desktop's token, by
// reconnecting over SSH. This build removes SSH hosts (ssh-remote-hosts-removal.ts), so the
// refusal must stand instead of opening an SSH connection to a leftover target.
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ resolveEnvironment: vi.fn(), recover: vi.fn() }))
vi.mock('../../../shared/runtime-environment-store', () => ({
  resolveEnvironment: mocks.resolveEnvironment
}))
vi.mock('../../managed-server/lifecycle/orcad-managed-tunnel', () => ({
  recoverRefusedManagedOrcadPairing: mocks.recover,
  managedOrcadPairingFailureStands: vi.fn()
}))
vi.mock('./runtime-environment-request-connections', () => ({
  getRuntimeEnvironmentStatusOwner: vi.fn()
}))

import {
  handleManagedSharedControlRefusal,
  recoverRefusedManagedPairing
} from './runtime-environment-managed-pairing-refusal'

const SSH_MANAGED = {
  id: 'env-1',
  orcadDeployment: { sshTargetId: 'box', sshTargetGeneration: 1, localPort: 1, remotePort: 2 }
}

describe('managed re-pair with SSH hosts removed from the build', () => {
  it('leaves the refusal standing without reconnecting over SSH', () => {
    mocks.resolveEnvironment.mockReturnValue(SSH_MANAGED)

    expect(recoverRefusedManagedPairing('/user-data', 'env-1', mocks.recover)).toBeNull()
    expect(handleManagedSharedControlRefusal('/user-data', 'env-1', mocks.recover)).toBeNull()
    expect(mocks.recover).not.toHaveBeenCalled()
  })
})

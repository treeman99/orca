import { isWslHostsInternalGateOpen } from '../../shared/wsl-host-internal-gate'
import { isRemoteOrcaServerDisabled } from '../enterprise/remote-orca-server-guard'
import type { OrcadDeploymentLink } from '../../shared/runtime-environments'

export const WSL_HOSTS_GATED_OFF_MESSAGE = 'WSL hosts are not available in this build.'

export function wslHostsGateOpen(): boolean {
  // Fork: a WSL host is an orcad this desktop deploys and then attaches to, which is exactly what
  // disableRemoteOrcaServer refuses; the env gate alone is one `setx` away for any user.
  return isWslHostsInternalGateOpen(process.env) && !isRemoteOrcaServerDisabled()
}

/** A persisted WSL host while the gate is closed: left on disk, but never listed or reached. */
export function isGatedOffWslHost(environment: {
  orcadDeployment?: OrcadDeploymentLink | null
}): boolean {
  return environment.orcadDeployment?.kind === 'wsl' && !wslHostsGateOpen()
}

export function assertWslHostReachable(environment: {
  orcadDeployment?: OrcadDeploymentLink | null
}): void {
  if (isGatedOffWslHost(environment)) {
    throw new Error(WSL_HOSTS_GATED_OFF_MESSAGE)
  }
}

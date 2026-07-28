// `disableRemoteOrcaServer`: this desktop may not attach itself to another Orca.
//
// Scoped to the OUTBOUND direction only — Settings → Remote Orca Servers, pairing codes,
// ephemeral VMs, and the boot hydration that would restore a saved remote as the active
// runtime. SSH hosts and the inbound `orca serve` listener are separate lanes and are
// deliberately untouched, so this switch does not take away remote development.
//
// Gated in main because the renderer is outside the trust boundary; hiding the pane is a
// display decision, this is the block.

import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import { getEnterprisePolicy } from './enterprise-policy-file'

export const REMOTE_ORCA_SERVER_DISABLED_BY_POLICY = 'remote_orca_server_disabled_by_policy'

const GUIDANCE = 'Remote Orca servers are turned off by your organization’s Orca policy.'

export function isRemoteOrcaServerDisabled(): boolean {
  return getEnterprisePolicy().disableRemoteOrcaServer
}

/**
 * A ready-made RPC failure when the policy forbids reaching a remote runtime, or null
 * when it does not. Shaped like a transport failure so callers need no new branch.
 */
export function remoteOrcaServerRefusal<T>(): RuntimeRpcResponse<T> | null {
  if (!isRemoteOrcaServerDisabled()) {
    return null
  }
  return {
    ok: false,
    error: { code: REMOTE_ORCA_SERVER_DISABLED_BY_POLICY, message: GUIDANCE }
  } as RuntimeRpcResponse<T>
}

/** Throws when the policy forbids registering or activating a remote Orca runtime. */
export function assertRemoteOrcaServerAllowed(): void {
  if (isRemoteOrcaServerDisabled()) {
    throw new Error(REMOTE_ORCA_SERVER_DISABLED_BY_POLICY)
  }
}

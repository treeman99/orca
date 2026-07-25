// A download issued through `node:https` (rather than Electron's session or a
// guarded global fetch) leaves the perimeter three ways at once: it ignores the
// proxy applied in network/proxy-settings.ts, it is invisible to the allowlist in
// enterprise-network-guard.ts, and Node validates TLS against its own bundled CA
// set — not the Windows certificate store where the corporate root CA lives, so it
// also fails inspection proxies. Under lockdown such a fetch must refuse loudly
// instead of quietly reaching a public host.

import { normalizeHost } from '../../shared/enterprise-policy'

import { getEnterprisePolicy } from './enterprise-policy-file'

/**
 * A refusal message naming the policy that forbids fetching `url` outside the
 * proxied/allowlisted lanes, or null when the download may proceed.
 */
export function enterpriseDirectDownloadRefusal(url: string): string | null {
  const policy = getEnterprisePolicy()
  const host = normalizeHost(url) ?? url
  if (policy.lockdown) {
    return (
      `Enterprise policy "lockdown" blocks the direct download from ${host}: it would bypass ` +
      'the configured proxy and the OS certificate store. Have an administrator stage this file locally.'
    )
  }
  if (policy.enforceNetworkAllowlist && !policy.allowedNetworkHosts.includes(host)) {
    return (
      `Enterprise policy blocks the direct download from ${host}: the host is not in ` +
      '"allowedNetworkHosts" in the Orca enterprise policy file.'
    )
  }
  return null
}

// Which GitHub host does `gh` actually talk to?
//
// Three different values get called "the GHES host" in this fork and they can disagree:
// the policy's `githubEnterpriseHost`, the host the user saved in Settings, and the one
// `gh` puts on the wire. Only the last is what leaves the machine, and the policy value
// does NOT change it — it prefills the login form and scopes the network allowlist.
//
// Resolution mirrors git/runner.ts's own order so the readout cannot drift from the
// argv it describes. A repository's own remote wins over everything below it, which is
// why `remoteHost` is a parameter: a workspace pointed at github.com stays on github.com
// no matter what the policy says.

import { normalizeHost } from '../../shared/enterprise-policy'

export type EffectiveGitHubHostSource =
  | 'repository-remote'
  | 'gh-host-env'
  | 'user-setting'
  | 'enterprise-policy'
  | 'default'

export type EffectiveGitHubHost = {
  host: string
  source: EffectiveGitHubHostSource
}

export const DEFAULT_GITHUB_HOST = 'github.com'

export type EffectiveGitHubHostInputs = {
  /** Host parsed from the workspace's origin remote, when it has one. */
  remoteHost?: string | null
  /** `gh`'s own variable. Already present on these machines; the fork does not set it. */
  ghHostEnv?: string | null
  /** What the user saved in Settings → Integrations. */
  storedHost?: string | null
  /** The administrator's `githubEnterpriseHost`. */
  policyHost?: string | null
}

export function resolveEffectiveGitHubHost(inputs: EffectiveGitHubHostInputs): EffectiveGitHubHost {
  const candidates: readonly [string | null | undefined, EffectiveGitHubHostSource][] = [
    [inputs.remoteHost, 'repository-remote'],
    [inputs.ghHostEnv, 'gh-host-env'],
    [inputs.storedHost, 'user-setting'],
    [inputs.policyHost, 'enterprise-policy']
  ]
  for (const [raw, source] of candidates) {
    const host = normalizeHost(raw)
    if (host) {
      return { host, source }
    }
  }
  return { host: DEFAULT_GITHUB_HOST, source: 'default' }
}

/** True when requests leave for the vendor's SaaS rather than the company's host. */
export function isVendorGitHubHost(host: string): boolean {
  const normalized = normalizeHost(host)
  return normalized === DEFAULT_GITHUB_HOST || normalized === 'api.github.com'
}

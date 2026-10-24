// Whether to warn at launch that gh is not signed in to the company GitHub host.
//
// Why gh's own hosts.yml and not `gh auth status`: the status command validates each token
// over the network, so a laptop off the company network reports a finished setup as a
// failed login and the warning would nag exactly the people who already followed it.
// The file records that the login happened, which is all this asks.

import { normalizeHost } from '../../shared/enterprise-policy'
import type { GithubEnterpriseSetupNotice } from '../../shared/github-enterprise-auth'
import type { GhConfigEnv } from './gh-config-host'

export type GithubEnterpriseSetupInputs = {
  /** The company host the policy names; null outside a corporate build. */
  companyHost: string | null
  /** Every host gh's config holds a login for. */
  ghConfigHosts: readonly string[]
  env: GhConfigEnv
}

export function resolveGithubEnterpriseSetupNotice(
  inputs: GithubEnterpriseSetupInputs
): GithubEnterpriseSetupNotice {
  const host = normalizeHost(inputs.companyHost)
  if (!host) {
    return null
  }
  // Any login counts, not only a sole one: gh picks the host from each repository's remote.
  if (inputs.ghConfigHosts.some((entry) => normalizeHost(entry) === host)) {
    return null
  }
  // gh also authenticates a GHES host from these variables without writing hosts.yml.
  if (inputs.env.GH_ENTERPRISE_TOKEN?.trim() || inputs.env.GITHUB_ENTERPRISE_TOKEN?.trim()) {
    return null
  }
  return { host }
}

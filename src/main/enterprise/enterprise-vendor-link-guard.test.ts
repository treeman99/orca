// The guard is the only refusal the `orca serve` / web clients ever see, so it is
// tested for both halves of its contract: it must catch every vendor destination
// this build ships, and it must not become a web filter that eats user content.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('./enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

import { isEnterpriseBlockedVendorLink, isVendorLink } from './enterprise-vendor-link-guard'

// Every URL this app ships to the OS browser through a "reach the vendor" affordance.
const SHIPPED_VENDOR_LINKS = [
  'https://discord.gg/fzjDKHxv8Q',
  'https://x.com/orca_build',
  'https://x.com/intent/post?text=My%20usage',
  'https://github.com/stablyai/orca',
  'https://github.com/stablyai/orca/issues',
  'https://github.com/stablyai/orca/issues/new',
  'https://www.onorca.dev/docs',
  'https://www.onorca.dev/docs/telemetry',
  'https://onorca.dev/changelog',
  'https://www.onorca.dev/docs/model/worktrees'
]

// Links the fleet legitimately uses. Blocking any of these would be a regression,
// not a tightening: they are the tools these users actually run.
const KEPT_LINKS = [
  'https://cli.github.com',
  'https://cli.github.com/manual/gh_auth_login',
  'https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli',
  'https://git-scm.com/downloads',
  'https://gitlab.com/gitlab-org/cli#installation',
  'https://nodejs.org/',
  'https://github.samsungds.net/acme/service/pull/12',
  // Someone else's repo on github.com SaaS is not the vendor's org.
  'https://github.com/BurntSushi/ripgrep#installation',
  // User content: an x.com link pasted into a PR body still opens.
  'https://x.com/some-reporter/status/123'
]

describe('isVendorLink', () => {
  it('matches every vendor destination this build ships', () => {
    for (const url of SHIPPED_VENDOR_LINKS) {
      expect(isVendorLink(url), url).toBe(true)
    }
  })

  it('leaves third-party tooling docs and user content alone', () => {
    for (const url of KEPT_LINKS) {
      expect(isVendorLink(url), url).toBe(false)
    }
  })

  it('ignores anything that is not an http(s) URL', () => {
    expect(isVendorLink('not a url')).toBe(false)
    expect(isVendorLink('file:///etc/passwd')).toBe(false)
    expect(isVendorLink('mailto:someone@x.com')).toBe(false)
  })
})

describe('isEnterpriseBlockedVendorLink', () => {
  beforeEach(() => {
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
  })

  it('blocks nothing without a policy — upstream behaviour is unchanged', () => {
    for (const url of [...SHIPPED_VENDOR_LINKS, ...KEPT_LINKS]) {
      expect(isEnterpriseBlockedVendorLink(url), url).toBe(false)
    }
  })

  it('blocks the vendor destinations under lockdown', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    for (const url of SHIPPED_VENDOR_LINKS) {
      expect(isEnterpriseBlockedVendorLink(url), url).toBe(true)
    }
  })

  it('still opens third-party tooling docs and user content under lockdown', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    for (const url of KEPT_LINKS) {
      expect(isEnterpriseBlockedVendorLink(url), url).toBe(false)
    }
  })

  it('never refuses the configured GHES host', () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeLockdownPolicy({ githubEnterpriseHost: 'github.samsungds.net' })
    )
    expect(isEnterpriseBlockedVendorLink('https://github.samsungds.net/acme/orca/issues')).toBe(
      false
    )
  })

  it('honours an explicit opt-back-in under lockdown', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy({ disableVendorLinks: false }))
    expect(isEnterpriseBlockedVendorLink('https://x.com/orca_build')).toBe(false)
  })

  it('can be set without the master switch', () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy({ disableVendorLinks: true }))
    expect(isEnterpriseBlockedVendorLink('https://discord.gg/fzjDKHxv8Q')).toBe(true)
  })
})

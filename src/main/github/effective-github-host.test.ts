import { describe, expect, it } from 'vitest'
import {
  ghConfiguredDefaultHost,
  isVendorGitHubHost,
  resolveEffectiveGitHubHost
} from './effective-github-host'

describe('resolveEffectiveGitHubHost', () => {
  it('falls back to github.com and says so', () => {
    expect(resolveEffectiveGitHubHost({})).toEqual({ host: 'github.com', source: 'default' })
  })

  // The order is the point: git/runner.ts puts argv/remote above GH_HOST above anything
  // Orca stores, and this readout has to describe the request that actually goes out.
  it('prefers the workspace remote over every configured host', () => {
    expect(
      resolveEffectiveGitHubHost({
        remoteHost: 'github.com',
        ghHostEnv: 'ghhost.corp.net',
        storedHost: 'stored.corp.net',
        policyHost: 'policy.corp.net'
      })
    ).toEqual({ host: 'github.com', source: 'repository-remote' })
  })

  it('prefers GH_HOST over the stored and policy hosts', () => {
    expect(
      resolveEffectiveGitHubHost({
        ghHostEnv: 'ghhost.corp.net',
        storedHost: 'stored.corp.net',
        policyHost: 'policy.corp.net'
      })
    ).toEqual({ host: 'ghhost.corp.net', source: 'gh-host-env' })
  })

  it('prefers GH_HOST over the host gh is configured for', () => {
    expect(
      resolveEffectiveGitHubHost({
        ghHostEnv: 'ghhost.corp.net',
        ghConfigHost: 'github.samsungds.net'
      })
    ).toEqual({ host: 'ghhost.corp.net', source: 'gh-host-env' })
  })

  // gh obeys its own config, so a host Orca merely stored does not redirect it. Reporting
  // the stored value here would put a corporate label on a request that leaves elsewhere.
  it('prefers the host gh is configured for over the stored and policy hosts', () => {
    expect(
      resolveEffectiveGitHubHost({
        ghConfigHost: 'github.samsungds.net',
        storedHost: 'stored.corp.net',
        policyHost: 'policy.corp.net'
      })
    ).toEqual({ host: 'github.samsungds.net', source: 'gh-config-host' })
  })

  it('prefers the saved host over the policy host', () => {
    expect(
      resolveEffectiveGitHubHost({ storedHost: 'stored.corp.net', policyHost: 'policy.corp.net' })
    ).toEqual({ host: 'stored.corp.net', source: 'user-setting' })
  })

  // The policy value is a prefill and an allowlist entry; it is only the destination when
  // nothing above it is set. Reporting it unconditionally would be the overclaim.
  it('uses the policy host only when nothing outranks it', () => {
    expect(resolveEffectiveGitHubHost({ policyHost: 'policy.corp.net' })).toEqual({
      host: 'policy.corp.net',
      source: 'enterprise-policy'
    })
  })

  it('normalizes a pasted URL, credentials, port, and path', () => {
    expect(
      resolveEffectiveGitHubHost({ storedHost: 'https://user@GitHub.SamsungDS.net:8443/api/v3' })
    ).toEqual({ host: 'github.samsungds.net', source: 'user-setting' })
  })

  it('skips a blank value instead of treating it as a host', () => {
    expect(
      resolveEffectiveGitHubHost({ storedHost: '   ', policyHost: 'policy.corp.net' })
    ).toEqual({ host: 'policy.corp.net', source: 'enterprise-policy' })
  })

  it('treats a git@ SSH-style remote host correctly', () => {
    expect(resolveEffectiveGitHubHost({ remoteHost: 'git@github.samsungds.net' })).toEqual({
      host: 'github.samsungds.net',
      source: 'repository-remote'
    })
  })
})

// Mirrors gh's own AuthConfig.DefaultHost(): one login is the default, anything else
// leaves gh on github.com — so inferring from two logins would be a guess, not a reading.
describe('ghConfiguredDefaultHost', () => {
  it('uses the single authenticated host', () => {
    expect(ghConfiguredDefaultHost([{ host: 'github.samsungds.net' }])).toBe('github.samsungds.net')
  })

  it('collapses duplicate accounts on the same host', () => {
    expect(
      ghConfiguredDefaultHost([{ host: 'github.samsungds.net' }, { host: 'GitHub.SamsungDS.net' }])
    ).toBe('github.samsungds.net')
  })

  it('infers nothing from two different hosts', () => {
    expect(
      ghConfiguredDefaultHost([{ host: 'github.com' }, { host: 'github.samsungds.net' }])
    ).toBeNull()
  })

  it('infers nothing when gh has no login, or could not be read', () => {
    expect(ghConfiguredDefaultHost([])).toBeNull()
    expect(ghConfiguredDefaultHost(null)).toBeNull()
    expect(ghConfiguredDefaultHost([{ host: '  ' }])).toBeNull()
  })
})

describe('isVendorGitHubHost', () => {
  it('recognizes the SaaS hosts', () => {
    expect(isVendorGitHubHost('github.com')).toBe(true)
    expect(isVendorGitHubHost('api.github.com')).toBe(true)
  })

  it('does not mistake a corporate host for the vendor', () => {
    expect(isVendorGitHubHost('github.samsungds.net')).toBe(false)
  })
})

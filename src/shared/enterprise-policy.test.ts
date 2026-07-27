import { describe, expect, it } from 'vitest'
import { normalizeHost, resolveEnterprisePolicy } from './enterprise-policy'

describe('resolveEnterprisePolicy', () => {
  it('defaults everything off when there is no policy file', () => {
    expect(resolveEnterprisePolicy(null)).toEqual({
      lockdown: false,
      disableTelemetry: false,
      disableAutoUpdate: false,
      disableStarNag: false,
      disableCloudRelay: false,
      disableUsagePolling: false,
      disableManagedClaudeAccounts: false,
      disableSpellcheck: false,
      enforceNetworkAllowlist: false,
      allowedNetworkHosts: [],
      githubEnterpriseHost: null,
      allowedAgents: null,
      llmEndpoints: [],
      sourcePath: null,
      warnings: []
    })
  })

  it('master lockdown turns on every inheriting switch', () => {
    const policy = resolveEnterprisePolicy({ lockdown: true })
    expect(policy.disableTelemetry).toBe(true)
    expect(policy.disableAutoUpdate).toBe(true)
    expect(policy.disableStarNag).toBe(true)
    expect(policy.disableCloudRelay).toBe(true)
    expect(policy.disableUsagePolling).toBe(true)
    expect(policy.disableManagedClaudeAccounts).toBe(true)
    expect(policy.disableSpellcheck).toBe(true)
    expect(policy.warnings).toEqual([])
  })

  it('keeps the network allowlist opt-in even under lockdown', () => {
    expect(resolveEnterprisePolicy({ lockdown: true }).enforceNetworkAllowlist).toBe(false)
    expect(
      resolveEnterprisePolicy({ lockdown: true, enforceNetworkAllowlist: true })
        .enforceNetworkAllowlist
    ).toBe(true)
  })

  it('lets one switch opt back in under lockdown', () => {
    const policy = resolveEnterprisePolicy({ lockdown: true, disableAutoUpdate: false })
    expect(policy.disableAutoUpdate).toBe(false)
    expect(policy.disableStarNag).toBe(true)
  })

  it('lets one switch turn something off without the master', () => {
    const policy = resolveEnterprisePolicy({ disableStarNag: true })
    expect(policy.lockdown).toBe(false)
    expect(policy.disableStarNag).toBe(true)
    expect(policy.disableAutoUpdate).toBe(false)
  })

  it('accepts common truthy and falsy spellings as strings', () => {
    for (const value of [true, 'true', 'TRUE', ' On ', 'yes', '1']) {
      expect(resolveEnterprisePolicy({ lockdown: value }).lockdown).toBe(true)
    }
    for (const value of [false, 'false', 'OFF', 'no', '0']) {
      expect(resolveEnterprisePolicy({ lockdown: value }).lockdown).toBe(false)
    }
  })

  // Regression: the previous env-based resolver treated a present-but-blank value
  // as an explicit "off", so a stray empty override silently unlocked a machine.
  it('treats a blank or unrecognized switch value as absent, not as off', () => {
    for (const value of ['', '   ', 'maybe', 0, null, []]) {
      const policy = resolveEnterprisePolicy({ lockdown: true, disableAutoUpdate: value })
      expect(policy.disableAutoUpdate).toBe(true)
      expect(policy.warnings).toHaveLength(1)
      expect(policy.warnings[0]).toContain('disableAutoUpdate')
    }
  })

  it('warns about an unknown key instead of failing silently', () => {
    const policy = resolveEnterprisePolicy({ lockdown: true, disableStarNagg: true })
    expect(policy.disableStarNag).toBe(true)
    expect(policy.warnings).toEqual(['Unknown policy key "disableStarNagg" ignored.'])
  })

  it('ignores $schema without warning', () => {
    expect(resolveEnterprisePolicy({ $schema: './schema.json', lockdown: true }).warnings).toEqual(
      []
    )
  })

  it('warns and falls back when the document is not an object', () => {
    const policy = resolveEnterprisePolicy(['lockdown'])
    expect(policy.lockdown).toBe(false)
    expect(policy.warnings[0]).toContain('must contain a JSON object')
  })

  it('carries the source path through for diagnostics', () => {
    expect(resolveEnterprisePolicy({}, {}, '/etc/orca/enterprise-policy.json').sourcePath).toBe(
      '/etc/orca/enterprise-policy.json'
    )
  })
})

describe('resolveEnterprisePolicy — GitHub Enterprise host', () => {
  it('reads githubEnterpriseHost from the file', () => {
    expect(
      resolveEnterprisePolicy({ githubEnterpriseHost: 'github.samsungds.net' }).githubEnterpriseHost
    ).toBe('github.samsungds.net')
  })

  it("falls back to gh's own GH_HOST", () => {
    expect(
      resolveEnterprisePolicy(null, { GH_HOST: 'github.samsungds.net' }).githubEnterpriseHost
    ).toBe('github.samsungds.net')
  })

  it('prefers the policy file over GH_HOST', () => {
    expect(
      resolveEnterprisePolicy({ githubEnterpriseHost: 'a.corp.net' }, { GH_HOST: 'b.corp.net' })
        .githubEnterpriseHost
    ).toBe('a.corp.net')
  })

  it('warns when the host is not a string', () => {
    const policy = resolveEnterprisePolicy({ githubEnterpriseHost: 443 })
    expect(policy.githubEnterpriseHost).toBeNull()
    expect(policy.warnings[0]).toContain('githubEnterpriseHost')
  })

  it('always allowlists the enterprise host', () => {
    expect(
      resolveEnterprisePolicy({ githubEnterpriseHost: 'github.samsungds.net' }).allowedNetworkHosts
    ).toEqual(['github.samsungds.net'])
  })
})

describe('resolveEnterprisePolicy — allowedAgents', () => {
  it('is null (no restriction) when the key is absent', () => {
    expect(resolveEnterprisePolicy({}).allowedAgents).toBeNull()
  })

  it('reads and dedupes a list of agent ids', () => {
    expect(
      resolveEnterprisePolicy({ allowedAgents: ['claude', 'claude', ' codex '] }).allowedAgents
    ).toEqual(['claude', 'codex'])
  })

  it('warns about a non-array value and falls back to no restriction', () => {
    const policy = resolveEnterprisePolicy({ allowedAgents: 'claude' })
    expect(policy.allowedAgents).toBeNull()
    expect(policy.warnings[0]).toContain('allowedAgents')
  })

  it('drops unusable entries but keeps the usable ones', () => {
    const policy = resolveEnterprisePolicy({ allowedAgents: ['claude', 42, '  '] })
    expect(policy.allowedAgents).toEqual(['claude'])
    expect(policy.warnings).toHaveLength(2)
  })

  // Why: an empty allowlist would hide every agent, so a typo must not brick the picker.
  it('treats an empty or all-invalid list as no restriction, with a warning', () => {
    const policy = resolveEnterprisePolicy({ allowedAgents: [] })
    expect(policy.allowedAgents).toBeNull()
    expect(policy.warnings[0]).toContain('allowedAgents')
  })
})

describe('resolveEnterprisePolicy — allowedNetworkHosts', () => {
  it('normalizes, dedupes, and appends the enterprise host', () => {
    const policy = resolveEnterprisePolicy({
      githubEnterpriseHost: 'github.samsungds.net',
      allowedNetworkHosts: ['https://Artifactory.samsungds.net/api/', 'github.samsungds.net:443']
    })
    expect(policy.allowedNetworkHosts).toEqual([
      'artifactory.samsungds.net',
      'github.samsungds.net'
    ])
  })

  it('warns about a non-array value', () => {
    const policy = resolveEnterprisePolicy({ allowedNetworkHosts: 'a.corp.net' })
    expect(policy.allowedNetworkHosts).toEqual([])
    expect(policy.warnings[0]).toContain('allowedNetworkHosts')
  })

  it('warns about an unusable entry but keeps the rest', () => {
    const policy = resolveEnterprisePolicy({ allowedNetworkHosts: ['a.corp.net', 42, '  '] })
    expect(policy.allowedNetworkHosts).toEqual(['a.corp.net'])
    expect(policy.warnings).toHaveLength(2)
  })
})

describe('normalizeHost', () => {
  it('reduces a full URL with credentials, port, and path to a bare host', () => {
    expect(normalizeHost('https://user@github.samsungds.net:443/x')).toBe('github.samsungds.net')
  })

  it('handles an scp-style git remote', () => {
    expect(normalizeHost('git@github.samsungds.net:org/repo.git')).toBe('github.samsungds.net')
  })

  it('returns null for blank or non-string input', () => {
    expect(normalizeHost('   ')).toBeNull()
    expect(normalizeHost(null)).toBeNull()
    expect(normalizeHost(undefined)).toBeNull()
  })
})

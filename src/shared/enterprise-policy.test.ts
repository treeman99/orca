import { describe, expect, it } from 'vitest'
import { resolveEnterprisePolicy, resolveEnterpriseGitHubHost } from './enterprise-policy'

describe('resolveEnterprisePolicy', () => {
  it('defaults everything off with an empty environment', () => {
    expect(resolveEnterprisePolicy({})).toEqual({
      lockdown: false,
      disableTelemetry: false,
      disableAutoUpdate: false,
      disableStarNag: false
    })
  })

  it('master lockdown turns on every non-essential switch', () => {
    const policy = resolveEnterprisePolicy({ ORCA_ENTERPRISE_LOCKDOWN: '1' })
    expect(policy).toEqual({
      lockdown: true,
      disableTelemetry: true,
      disableAutoUpdate: true,
      disableStarNag: true
    })
  })

  it('accepts common truthy spellings', () => {
    for (const value of ['1', 'true', 'yes', 'on', 'TRUE', ' On ']) {
      expect(resolveEnterprisePolicy({ ORCA_ENTERPRISE_LOCKDOWN: value }).lockdown).toBe(true)
    }
  })

  it('lets an individual switch opt back in under lockdown', () => {
    const policy = resolveEnterprisePolicy({
      ORCA_ENTERPRISE_LOCKDOWN: '1',
      ORCA_DISABLE_AUTO_UPDATE: '0'
    })
    expect(policy.disableAutoUpdate).toBe(false)
    expect(policy.disableStarNag).toBe(true)
  })

  it('lets an individual switch turn something off without the master', () => {
    const policy = resolveEnterprisePolicy({ ORCA_DISABLE_STAR_NAG: 'true' })
    expect(policy.lockdown).toBe(false)
    expect(policy.disableStarNag).toBe(true)
    expect(policy.disableAutoUpdate).toBe(false)
  })

  it('honors the existing telemetry kill switches for the telemetry field', () => {
    expect(resolveEnterprisePolicy({ DO_NOT_TRACK: '1' }).disableTelemetry).toBe(true)
    expect(resolveEnterprisePolicy({ ORCA_TELEMETRY_DISABLED: 'yes' }).disableTelemetry).toBe(true)
  })

  it('ignores unrecognized values and falls back to the default', () => {
    expect(resolveEnterprisePolicy({ ORCA_ENTERPRISE_LOCKDOWN: 'maybe' }).lockdown).toBe(false)
  })
})

describe('resolveEnterpriseGitHubHost', () => {
  it('returns null when neither var is set', () => {
    expect(resolveEnterpriseGitHubHost({})).toBeNull()
  })

  it('reads ORCA_GITHUB_ENTERPRISE_HOST', () => {
    expect(
      resolveEnterpriseGitHubHost({ ORCA_GITHUB_ENTERPRISE_HOST: 'github.samsungds.net' })
    ).toBe('github.samsungds.net')
  })

  it('falls back to gh native GH_HOST', () => {
    expect(resolveEnterpriseGitHubHost({ GH_HOST: 'github.samsungds.net' })).toBe(
      'github.samsungds.net'
    )
  })

  it('prefers the Orca var over GH_HOST', () => {
    expect(
      resolveEnterpriseGitHubHost({
        ORCA_GITHUB_ENTERPRISE_HOST: 'a.corp.net',
        GH_HOST: 'b.corp.net'
      })
    ).toBe('a.corp.net')
  })

  it('normalizes a full URL, path, credentials, and port down to a bare host', () => {
    expect(
      resolveEnterpriseGitHubHost({ GH_HOST: 'https://user@github.samsungds.net:443/x' })
    ).toBe('github.samsungds.net')
  })

  it('returns null for a blank value', () => {
    expect(resolveEnterpriseGitHubHost({ ORCA_GITHUB_ENTERPRISE_HOST: '   ' })).toBeNull()
  })
})

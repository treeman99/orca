import { describe, expect, it } from 'vitest'
import { readGhConfigHosts } from './gh-config-host'
import { resolveGithubEnterpriseSetupNotice } from './github-enterprise-setup-notice'

const COMPANY = 'github.samsungds.net'
const WINDOWS_ENV = { AppData: 'C:\\Users\\dev\\AppData\\Roaming' }

function hostsFrom(contents: string | null): string[] {
  return readGhConfigHosts(WINDOWS_ENV, 'win32', () => {
    if (contents === null) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    }
    return contents
  })
}

function notice(contents: string | null, env: Record<string, string> = {}): unknown {
  return resolveGithubEnterpriseSetupNotice({
    companyHost: COMPANY,
    ghConfigHosts: hostsFrom(contents),
    env
  })
}

describe('resolveGithubEnterpriseSetupNotice', () => {
  it('warns when gh has no config at all, which is also what a missing gh looks like', () => {
    expect(notice(null)).toEqual({ host: COMPANY })
  })

  it('warns when gh is signed in to github.com only', () => {
    expect(notice('github.com:\n    user: dev-user\n')).toEqual({ host: COMPANY })
  })

  it('stays quiet once gh holds a login for the company host', () => {
    expect(notice(`${COMPANY}:\n    user: dev-user\n    git_protocol: https\n`)).toBeNull()
  })

  // gh's default host falls back to github.com here, but each repository's remote still
  // reaches the company host, so the setup is done.
  it('stays quiet when the company host is one of several logins', () => {
    expect(notice(`github.com:\n    user: a\n${COMPANY}:\n    user: b\n`)).toBeNull()
  })

  it('stays quiet when gh authenticates the company host from an environment token', () => {
    expect(notice(null, { GH_ENTERPRISE_TOKEN: 'ghp_x' })).toBeNull()
  })

  it('stays quiet outside a corporate build', () => {
    expect(
      resolveGithubEnterpriseSetupNotice({ companyHost: null, ghConfigHosts: [], env: {} })
    ).toBeNull()
  })
})

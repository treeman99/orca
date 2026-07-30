import { describe, expect, it } from 'vitest'
import { ghHostsFilePath, parseGhHostsFile, readGhConfiguredHost } from './gh-config-host'

const HOSTS_YML = `github.samsungds.net:
    users:
        dev-user:
            git_protocol: https
    git_protocol: https
    user: dev-user
`

// Precedence is exclusive, not a candidate list — gh's ConfigDir() returns one directory.
// It is also what lets the test suites pin GH_CONFIG_DIR away from a developer's real config.
describe('ghHostsFilePath', () => {
  it('uses GH_CONFIG_DIR outright, ignoring every lower location', () => {
    expect(
      ghHostsFilePath(
        { GH_CONFIG_DIR: '/opt/gh', XDG_CONFIG_HOME: '/xdg', HOME: '/home/dev' },
        'linux'
      )
    ).toBe('/opt/gh/hosts.yml')
  })

  it('uses XDG_CONFIG_HOME ahead of the home default', () => {
    expect(ghHostsFilePath({ XDG_CONFIG_HOME: '/xdg', HOME: '/home/dev' }, 'linux')).toBe(
      '/xdg/gh/hosts.yml'
    )
  })

  it('uses the Windows AppData location', () => {
    expect(
      ghHostsFilePath(
        { AppData: 'C:\\Users\\dev\\AppData\\Roaming', USERPROFILE: 'C:\\Users\\dev' },
        'win32'
      )
    ).toBe('C:\\Users\\dev\\AppData\\Roaming\\GitHub CLI\\hosts.yml')
  })

  it('falls back to the home default off Windows', () => {
    expect(ghHostsFilePath({ HOME: '/home/dev' }, 'linux')).toBe('/home/dev/.config/gh/hosts.yml')
  })

  it('yields nothing rather than a bogus relative path when no home is known', () => {
    expect(ghHostsFilePath({}, 'linux')).toBeNull()
  })
})

describe('parseGhHostsFile', () => {
  it('takes the unindented host key and ignores everything nested under it', () => {
    expect(parseGhHostsFile(HOSTS_YML)).toEqual(['github.samsungds.net'])
  })

  it('lists every host when gh holds more than one', () => {
    expect(
      parseGhHostsFile('github.com:\n    user: a\ngithub.samsungds.net:\n    user: b\n')
    ).toEqual(['github.com', 'github.samsungds.net'])
  })

  it('skips comments, blanks, and list items', () => {
    expect(parseGhHostsFile('# a comment\n\n- not-a-host\ngithub.samsungds.net:\n')).toEqual([
      'github.samsungds.net'
    ])
  })

  it('normalizes case', () => {
    expect(parseGhHostsFile('GitHub.SamsungDS.net:\n')).toEqual(['github.samsungds.net'])
  })

  it('finds no host in a file that is not gh’s', () => {
    expect(parseGhHostsFile('{ "lockdown": true }')).toEqual([])
  })
})

describe('readGhConfiguredHost', () => {
  it('returns the single configured host', () => {
    expect(readGhConfiguredHost({ HOME: '/home/dev' }, 'linux', () => HOSTS_YML)).toBe(
      'github.samsungds.net'
    )
  })

  // gh's own DefaultHost() falls back to github.com with two logins, so picking one here
  // would label vendor-bound requests as corporate.
  it('returns null when gh is logged in to more than one host', () => {
    expect(
      readGhConfiguredHost(
        { HOME: '/home/dev' },
        'linux',
        () => 'github.com:\n    user: a\ngithub.samsungds.net:\n    user: b\n'
      )
    ).toBeNull()
  })

  // The isolation contract the test suites rely on: an explicit GH_CONFIG_DIR that does not
  // exist must read as "gh has no config", never fall back to the developer's real one.
  it('reads only the location GH_CONFIG_DIR names', () => {
    const seen: string[] = []
    const host = readGhConfiguredHost(
      { GH_CONFIG_DIR: '/nonexistent', HOME: '/home/dev' },
      'linux',
      (filePath) => {
        seen.push(filePath)
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
    )
    expect(host).toBeNull()
    expect(seen).toEqual(['/nonexistent/hosts.yml'])
  })

  it('returns null when gh has no config at all', () => {
    expect(
      readGhConfiguredHost({ HOME: '/home/dev' }, 'linux', () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      })
    ).toBeNull()
  })
})

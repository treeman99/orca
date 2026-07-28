import { beforeEach, describe, expect, it } from 'vitest'
import { __resetPersistedWindowsPathCacheForTests } from '../pty/windows-environment-path'
import { buildAwsCommandEnv, resolveAwsCommand } from './aws-cli-command'

// The whole point of injecting `platform` is that these win32 cases run on the macOS and
// Linux CI runners, where the bug this file guards was invisible.
const WIN32 = { platform: 'win32' as NodeJS.Platform }

function existsIn(...present: string[]): (candidate: string) => boolean {
  const set = new Set(present.map((entry) => entry.toLowerCase()))
  return (candidate) => set.has(candidate.toLowerCase())
}

describe('resolveAwsCommand', () => {
  it('leaves the bare name alone off Windows', () => {
    const env = { PATH: '/usr/local/bin' }
    expect(resolveAwsCommand(env, { platform: 'darwin', fileExists: () => true })).toBe('aws')
    expect(resolveAwsCommand(env, { platform: 'linux', fileExists: () => true })).toBe('aws')
  })

  it('resolves aws.exe on PATH to an absolute path', () => {
    const exe = 'C:\\Program Files\\Amazon\\AWS CLI\\aws.exe'
    const command = resolveAwsCommand(
      { Path: 'C:\\Windows\\System32;C:\\Program Files\\Amazon\\AWS CLI' },
      { ...WIN32, fileExists: existsIn(exe) }
    )
    expect(command).toBe(exe)
  })

  it('resolves a .cmd shim, which a bare spawn cannot run at all', () => {
    const cmd = 'C:\\Python\\Scripts\\aws.cmd'
    expect(
      resolveAwsCommand({ Path: 'C:\\Python\\Scripts' }, { ...WIN32, fileExists: existsIn(cmd) })
    ).toBe(cmd)
  })

  it('reads Path case-insensitively, as Windows does', () => {
    const exe = 'C:\\cli\\aws.exe'
    expect(resolveAwsCommand({ PATH: 'C:\\cli' }, { ...WIN32, fileExists: existsIn(exe) })).toBe(
      exe
    )
  })

  it('honors PATHEXT order within a directory', () => {
    const files = existsIn('C:\\cli\\aws.exe', 'C:\\cli\\aws.cmd')
    expect(
      resolveAwsCommand({ Path: 'C:\\cli', PATHEXT: '.CMD;.EXE' }, { ...WIN32, fileExists: files })
    ).toBe('C:\\cli\\aws.cmd')
    expect(
      resolveAwsCommand({ Path: 'C:\\cli', PATHEXT: '.EXE;.CMD' }, { ...WIN32, fileExists: files })
    ).toBe('C:\\cli\\aws.exe')
  })

  it('searches PATH directories in order', () => {
    const second = 'C:\\second\\aws.exe'
    expect(
      resolveAwsCommand(
        { Path: 'C:\\first;C:\\second' },
        { ...WIN32, fileExists: existsIn(second) }
      )
    ).toBe(second)
  })

  // The reported failure: PATH is stale, but the MSI put the CLI where it always does.
  it('falls back to the per-machine MSI location when PATH misses it', () => {
    const exe = 'C:\\Program Files\\Amazon\\AWS CLI\\aws.exe'
    expect(
      resolveAwsCommand(
        { Path: 'C:\\Windows\\System32', ProgramFiles: 'C:\\Program Files' },
        { ...WIN32, fileExists: existsIn(exe) }
      )
    ).toBe(exe)
  })

  it('falls back to the per-user MSI location', () => {
    const exe = 'C:\\Users\\dev\\AppData\\Local\\Amazon\\AWSCLIV2\\aws.exe'
    expect(
      resolveAwsCommand(
        { Path: 'C:\\Windows\\System32', LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' },
        { ...WIN32, fileExists: existsIn(exe) }
      )
    ).toBe(exe)
  })

  it('prefers PATH over the installer fallback', () => {
    const onPath = 'C:\\cli\\aws.exe'
    expect(
      resolveAwsCommand(
        { Path: 'C:\\cli', ProgramFiles: 'C:\\Program Files' },
        {
          ...WIN32,
          fileExists: existsIn(onPath, 'C:\\Program Files\\Amazon\\AWS CLI\\aws.exe')
        }
      )
    ).toBe(onPath)
  })

  // A bare name still lets the spawn fail with a real OS error rather than turning an
  // unusual install layout into a silent "not installed".
  it('returns the bare name when nothing resolves', () => {
    expect(
      resolveAwsCommand({ Path: 'C:\\Windows\\System32' }, { ...WIN32, fileExists: () => false })
    ).toBe('aws')
  })
})

describe('buildAwsCommandEnv', () => {
  beforeEach(() => {
    __resetPersistedWindowsPathCacheForTests()
  })

  it('clears AWS_PAGER so the CLI cannot withhold the authorization URL', () => {
    expect(buildAwsCommandEnv({ AWS_PAGER: 'less' }, { platform: 'darwin' }).AWS_PAGER).toBe('')
  })

  it('leaves PATH untouched off Windows', () => {
    const env = buildAwsCommandEnv({ PATH: '/usr/bin' }, { platform: 'darwin' })
    expect(env.PATH).toBe('/usr/bin')
  })

  // The other half of the reported bug: Electron's PATH predates the AWS CLI install.
  it('merges the registry PATH back in on Windows', () => {
    const env = buildAwsCommandEnv(
      { Path: 'C:\\Windows\\System32' },
      {
        platform: 'win32',
        execFileSync: ((_file: string, args: readonly string[]) =>
          args.includes('HKCU\\Environment')
            ? ''
            : '    Path    REG_EXPAND_SZ    C:\\Program Files\\Amazon\\AWS CLI\r\n') as never
      }
    )
    expect(env.Path).toContain('C:\\Program Files\\Amazon\\AWS CLI')
    expect(env.Path).toContain('C:\\Windows\\System32')
  })

  it('does not duplicate a segment the process PATH already has', () => {
    const env = buildAwsCommandEnv(
      { Path: 'C:\\Program Files\\Amazon\\AWS CLI' },
      {
        platform: 'win32',
        execFileSync: (() =>
          '    Path    REG_EXPAND_SZ    C:\\Program Files\\Amazon\\AWS CLI\r\n') as never
      }
    )
    expect(env.Path?.split(';').filter(Boolean)).toEqual(['C:\\Program Files\\Amazon\\AWS CLI'])
  })
})

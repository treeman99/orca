import { beforeEach, describe, expect, it } from 'vitest'
import { __resetPersistedWindowsPathCacheForTests } from '../pty/windows-environment-path'
import { buildGatewayCommandEnv, resolveGatewayCommand } from './gateway-cli-command'

// The whole point of injecting `platform` is that these win32 cases run on the macOS and
// Linux CI runners, where the bug this file guards is invisible.
const WIN32 = { platform: 'win32' as NodeJS.Platform }

function existsIn(...present: string[]): (candidate: string) => boolean {
  const set = new Set(present.map((entry) => entry.toLowerCase()))
  return (candidate) => set.has(candidate.toLowerCase())
}

describe('resolveGatewayCommand', () => {
  it('leaves the bare name alone off Windows', () => {
    const env = { PATH: '/usr/local/bin' }
    expect(resolveGatewayCommand(env, { platform: 'darwin', fileExists: () => true })).toBe(
      'gateway-cli'
    )
    expect(resolveGatewayCommand(env, { platform: 'linux', fileExists: () => true })).toBe(
      'gateway-cli'
    )
  })

  it('resolves gateway-cli.exe on PATH to an absolute path', () => {
    const exe = 'C:\\Tools\\gateway\\gateway-cli.exe'
    expect(
      resolveGatewayCommand(
        { Path: 'C:\\Windows\\System32;C:\\Tools\\gateway' },
        {
          ...WIN32,
          fileExists: existsIn(exe)
        }
      )
    ).toBe(exe)
  })

  it('resolves a .cmd shim, which a bare spawn cannot run at all', () => {
    const cmd = 'C:\\Tools\\gateway\\gateway-cli.cmd'
    expect(
      resolveGatewayCommand({ Path: 'C:\\Tools\\gateway' }, { ...WIN32, fileExists: existsIn(cmd) })
    ).toBe(cmd)
  })

  it('reads Path case-insensitively, as Windows does', () => {
    const exe = 'C:\\cli\\gateway-cli.exe'
    expect(
      resolveGatewayCommand({ PATH: 'C:\\cli' }, { ...WIN32, fileExists: existsIn(exe) })
    ).toBe(exe)
  })

  it('honors PATHEXT order within a directory', () => {
    const files = existsIn('C:\\cli\\gateway-cli.exe', 'C:\\cli\\gateway-cli.cmd')
    expect(
      resolveGatewayCommand(
        { Path: 'C:\\cli', PATHEXT: '.CMD;.EXE' },
        { ...WIN32, fileExists: files }
      )
    ).toBe('C:\\cli\\gateway-cli.cmd')
    expect(
      resolveGatewayCommand(
        { Path: 'C:\\cli', PATHEXT: '.EXE;.CMD' },
        { ...WIN32, fileExists: files }
      )
    ).toBe('C:\\cli\\gateway-cli.exe')
  })

  it('searches PATH directories in order', () => {
    const second = 'C:\\second\\gateway-cli.exe'
    expect(
      resolveGatewayCommand(
        { Path: 'C:\\first;C:\\second' },
        { ...WIN32, fileExists: existsIn(second) }
      )
    ).toBe(second)
  })

  // A bare name still lets the spawn fail with a real OS error rather than turning an
  // unusual install layout into a silent "not installed".
  it('returns the bare name when nothing resolves', () => {
    expect(
      resolveGatewayCommand(
        { Path: 'C:\\Windows\\System32' },
        { ...WIN32, fileExists: () => false }
      )
    ).toBe('gateway-cli')
  })

  // We do not know where gateway-cli installs, and a guessed directory would resolve to
  // the wrong binary on a machine that happens to have one there.
  it('guesses no installer directory', () => {
    const seen: string[] = []
    resolveGatewayCommand(
      {
        Path: '',
        ProgramFiles: 'C:\\Program Files',
        LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local'
      },
      {
        ...WIN32,
        fileExists: (candidate) => {
          seen.push(candidate)
          return false
        }
      }
    )
    expect(seen).toEqual([])
  })
})

describe('buildGatewayCommandEnv', () => {
  beforeEach(() => {
    __resetPersistedWindowsPathCacheForTests()
  })

  it('leaves PATH untouched off Windows', () => {
    expect(buildGatewayCommandEnv({ PATH: '/usr/bin' }, { platform: 'darwin' }).PATH).toBe(
      '/usr/bin'
    )
  })

  // Orca does not manage the credential, so it must not invent variables the CLI (and
  // every process Orca later spawns) would inherit.
  it('adds no variable of its own', () => {
    const base = { PATH: '/usr/bin', HOME: '/home/dev' }
    expect(buildGatewayCommandEnv(base, { platform: 'darwin' })).toEqual(base)
  })

  // Electron's PATH predates a CLI installed after login; the registry PATH does not.
  it('merges the registry PATH back in on Windows', () => {
    const env = buildGatewayCommandEnv(
      { Path: 'C:\\Windows\\System32' },
      {
        platform: 'win32',
        execFileSync: ((_file: string, args: readonly string[]) =>
          args.includes('HKCU\\Environment')
            ? ''
            : '    Path    REG_EXPAND_SZ    C:\\Tools\\gateway\r\n') as never
      }
    )
    expect(env.Path).toContain('C:\\Tools\\gateway')
    expect(env.Path).toContain('C:\\Windows\\System32')
  })

  it('does not duplicate a segment the process PATH already has', () => {
    const env = buildGatewayCommandEnv(
      { Path: 'C:\\Tools\\gateway' },
      {
        platform: 'win32',
        execFileSync: (() => '    Path    REG_EXPAND_SZ    C:\\Tools\\gateway\r\n') as never
      }
    )
    expect(env.Path?.split(';').filter(Boolean)).toEqual(['C:\\Tools\\gateway'])
  })
})

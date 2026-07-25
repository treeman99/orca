import { beforeEach, describe, expect, it, vi } from 'vitest'

const readFileSyncMock = vi.fn<(target: string, encoding: string) => string>()

vi.mock('node:fs', () => ({
  readFileSync: (target: string, encoding: string) => readFileSyncMock(target, encoding)
}))

const { electronApp } = vi.hoisted(() => ({
  electronApp: { getPath: () => '/home/dev/.config/Orca', isPackaged: false }
}))
vi.mock('electron', () => ({ app: electronApp }))

import {
  ENTERPRISE_POLICY_PATH_ENV,
  enterprisePolicySearchPaths,
  getEnterprisePolicy,
  resetEnterprisePolicyCacheForTests
} from './enterprise-policy-file'

const MACHINE_WIDE_LINUX = '/etc/orca/enterprise-policy.json'
const USER_LEVEL = '/home/dev/.config/Orca/enterprise-policy.json'

// The machine-wide candidate is platform-specific, so derive it rather than
// hardcoding one OS's path into the discovery assertions.
function machineWidePath(): string {
  const [first] = enterprisePolicySearchPaths(
    { ...process.env, [ENTERPRISE_POLICY_PATH_ENV]: undefined },
    process.platform,
    '/home/dev/.config/Orca'
  )
  return first ?? ''
}

// Same reason: on a Windows host the per-user candidate is joined with
// backslashes, so it cannot be compared against the posix literal.
function userLevelPath(): string {
  return enterprisePolicySearchPaths({}, process.platform, '/home/dev/.config/Orca').at(-1) ?? ''
}

function enoent(): never {
  const error = new Error('ENOENT') as NodeJS.ErrnoException
  error.code = 'ENOENT'
  throw error
}

beforeEach(() => {
  resetEnterprisePolicyCacheForTests()
  readFileSyncMock.mockReset()
  readFileSyncMock.mockImplementation(enoent)
  electronApp.isPackaged = false
})

describe('enterprisePolicySearchPaths', () => {
  it('searches the machine-wide path before the per-user one', () => {
    expect(enterprisePolicySearchPaths({}, 'linux', '/home/dev/.config/Orca')).toEqual([
      MACHINE_WIDE_LINUX,
      USER_LEVEL
    ])
  })

  it('uses ProgramData on Windows so every profile on the box is covered', () => {
    expect(enterprisePolicySearchPaths({ ProgramData: 'C:\\ProgramData' }, 'win32', null)).toEqual([
      expect.stringContaining('Orca')
    ])
    const [machineWide] = enterprisePolicySearchPaths(
      { ProgramData: 'C:\\ProgramData' },
      'win32',
      null
    )
    expect(machineWide).toContain('ProgramData')
    expect(machineWide).toContain('enterprise-policy.json')
  })

  it('builds Windows candidates with backslashes on any host OS', () => {
    expect(
      enterprisePolicySearchPaths(
        { ProgramData: 'C:\\ProgramData' },
        'win32',
        'C:\\Users\\dev\\AppData\\Roaming\\Orca'
      )
    ).toEqual([
      'C:\\ProgramData\\Orca\\enterprise-policy.json',
      'C:\\Users\\dev\\AppData\\Roaming\\Orca\\enterprise-policy.json'
    ])
  })

  it('falls back to the macOS system-wide Application Support directory', () => {
    expect(enterprisePolicySearchPaths({}, 'darwin', null)).toEqual([
      '/Library/Application Support/Orca/enterprise-policy.json'
    ])
  })

  it('drops the Windows machine-wide candidate when ProgramData is unset', () => {
    expect(enterprisePolicySearchPaths({}, 'win32', null)).toEqual([])
  })

  it('honors an explicit path and ignores the defaults', () => {
    expect(
      enterprisePolicySearchPaths(
        { [ENTERPRISE_POLICY_PATH_ENV]: ' /opt/policy.json ' },
        'linux',
        '/home/dev/.config/Orca'
      )
    ).toEqual(['/opt/policy.json'])
  })

  it('supports an explicit opt-out so a machine-wide file can be neutralized', () => {
    for (const value of ['off', 'NONE', 'disabled', 'false', '0']) {
      expect(
        enterprisePolicySearchPaths({ [ENTERPRISE_POLICY_PATH_ENV]: value }, 'linux', null)
      ).toEqual([])
    }
  })

  // The security boundary: on Windows any standard user can set their own
  // environment variable, so a shipped build must not let them switch the
  // administrator's machine-wide file off or redirect away from it.
  describe('with the environment override refused (packaged build)', () => {
    it('ignores an opt-out value and still searches the machine-wide path first', () => {
      expect(
        enterprisePolicySearchPaths(
          { [ENTERPRISE_POLICY_PATH_ENV]: 'off', ProgramData: 'C:\\ProgramData' },
          'win32',
          'C:\\Users\\dev\\AppData\\Roaming\\Orca',
          false
        )
      ).toEqual([
        'C:\\ProgramData\\Orca\\enterprise-policy.json',
        'C:\\Users\\dev\\AppData\\Roaming\\Orca\\enterprise-policy.json'
      ])
    })

    it('demotes a user-supplied path below the machine-wide file instead of replacing it', () => {
      expect(
        enterprisePolicySearchPaths(
          {
            [ENTERPRISE_POLICY_PATH_ENV]: 'C:\\Users\\dev\\mine.json',
            ProgramData: 'C:\\ProgramData'
          },
          'win32',
          null,
          false
        )
      ).toEqual(['C:\\ProgramData\\Orca\\enterprise-policy.json', 'C:\\Users\\dev\\mine.json'])
    })
  })
})

describe('getEnterprisePolicy', () => {
  it('returns an all-off policy when no file exists', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    const policy = getEnterprisePolicy()
    expect(policy.lockdown).toBe(false)
    expect(policy.sourcePath).toBeNull()
  })

  it('parses a JSONC document with comments and a trailing comma', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockReturnValue(`{
      // corporate lockdown
      "lockdown": true,
      "githubEnterpriseHost": "github.samsungds.net",
    }`)
    const policy = getEnterprisePolicy()
    expect(policy.lockdown).toBe(true)
    expect(policy.disableStarNag).toBe(true)
    expect(policy.githubEnterpriseHost).toBe('github.samsungds.net')
    expect(policy.sourcePath).toBe('/opt/policy.json')
  })

  it('prefers the machine-wide file over the per-user one', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '')
    readFileSyncMock.mockImplementation((target: string) =>
      target === machineWidePath() ? '{ "lockdown": true }' : '{ "lockdown": false }'
    )
    expect(getEnterprisePolicy().lockdown).toBe(true)
    expect(getEnterprisePolicy().sourcePath).toBe(machineWidePath())
  })

  it('falls through to the per-user file when the machine-wide one is absent', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '')
    readFileSyncMock.mockImplementation((target: string) =>
      target === userLevelPath() ? '{ "lockdown": true }' : enoent()
    )
    expect(getEnterprisePolicy().sourcePath).toBe(userLevelPath())
  })

  it('applies a file saved with a UTF-8 BOM by Windows admin tooling', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockReturnValue('\uFEFF{ "lockdown": true }')
    expect(getEnterprisePolicy().lockdown).toBe(true)
  })

  it('applies a UTF-16LE file, the Windows PowerShell 5.1 Out-File default', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('{ "lockdown": true }', 'utf16le')
    ])
    readFileSyncMock.mockImplementation((_target: string, encoding: string) =>
      utf16.toString(encoding as BufferEncoding)
    )
    expect(getEnterprisePolicy().lockdown).toBe(true)
  })

  it('refuses to apply a malformed file rather than half-applying it', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockReturnValue('{ "lockdown": true ')
    const policy = getEnterprisePolicy()
    expect(policy.lockdown).toBe(false)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'))
    stderr.mockRestore()
  })

  it('reports an unreadable file but stays usable', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockImplementation(() => {
      const error = new Error('EACCES') as NodeJS.ErrnoException
      error.code = 'EACCES'
      throw error
    })
    expect(getEnterprisePolicy().lockdown).toBe(false)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('could not read'))
    stderr.mockRestore()
  })

  it('surfaces document warnings on stderr', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockReturnValue('{ "lockdown": true, "disableStarNagg": true }')
    getEnterprisePolicy()
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('disableStarNagg'))
    stderr.mockRestore()
  })

  it('lets a packaged build keep a machine-wide policy that the user tried to switch off', () => {
    electronApp.isPackaged = true
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, 'off')
    readFileSyncMock.mockImplementation((target: string) =>
      target === machineWidePath() ? '{ "lockdown": true }' : enoent()
    )
    expect(getEnterprisePolicy().lockdown).toBe(true)
  })

  it('still honors the opt-out in an unpackaged build so the suite can isolate itself', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, 'off')
    readFileSyncMock.mockReturnValue('{ "lockdown": true }')
    expect(getEnterprisePolicy().lockdown).toBe(false)
    expect(readFileSyncMock).not.toHaveBeenCalled()
  })

  it('reads the file once and caches the result', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockReturnValue('{ "lockdown": true }')
    expect(getEnterprisePolicy()).toBe(getEnterprisePolicy())
    expect(readFileSyncMock).toHaveBeenCalledTimes(1)
  })
})

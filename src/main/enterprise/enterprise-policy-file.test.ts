import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  getEnterprisePolicyResolutionTrace,
  resetEnterprisePolicyCacheForTests
} from './enterprise-policy-file'

const MACHINE_WIDE_LINUX = '/etc/orca/enterprise-policy.json'
const USER_LEVEL = '/home/dev/.config/Orca/enterprise-policy.json'
const RESOURCES_DIR = '/pkg/resources'
// The loader joins with the host separator, so derive the expectation the same way.
const BUNDLED = path.join(RESOURCES_DIR, 'enterprise-policy.json')

const originalResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath')

// `process.resourcesPath` only exists under Electron, and it is declared readonly,
// so a packaged-build case has to install its own descriptor.
function stubResourcesPath(value: string | undefined): void {
  Object.defineProperty(process, 'resourcesPath', { value, configurable: true, writable: true })
}

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
  stubResourcesPath(undefined)
})

afterEach(() => {
  if (originalResourcesPath) {
    Object.defineProperty(process, 'resourcesPath', originalResourcesPath)
  } else {
    delete (process as unknown as Record<string, unknown>).resourcesPath
  }
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

    // The installer carries a default policy, so a PC that never received the GPO
    // file is still locked. Both writable candidates must stay below it.
    it('orders the bundled default between the machine-wide file and the writable ones', () => {
      expect(
        enterprisePolicySearchPaths(
          {
            [ENTERPRISE_POLICY_PATH_ENV]: 'C:\\Users\\dev\\mine.json',
            ProgramData: 'C:\\ProgramData'
          },
          'win32',
          'C:\\Users\\dev\\AppData\\Roaming\\Orca',
          false,
          'C:\\Users\\dev\\AppData\\Local\\Programs\\orca\\resources\\enterprise-policy.json'
        )
      ).toEqual([
        'C:\\ProgramData\\Orca\\enterprise-policy.json',
        'C:\\Users\\dev\\AppData\\Local\\Programs\\orca\\resources\\enterprise-policy.json',
        'C:\\Users\\dev\\mine.json',
        'C:\\Users\\dev\\AppData\\Roaming\\Orca\\enterprise-policy.json'
      ])
    })

    it('keeps that order on macOS', () => {
      expect(
        enterprisePolicySearchPaths(
          {},
          'darwin',
          '/Users/dev/Library/Application Support/Orca',
          false,
          '/Applications/Orca.app/Contents/Resources/enterprise-policy.json'
        )
      ).toEqual([
        '/Library/Application Support/Orca/enterprise-policy.json',
        '/Applications/Orca.app/Contents/Resources/enterprise-policy.json',
        '/Users/dev/Library/Application Support/Orca/enterprise-policy.json'
      ])
    })

    it('keeps that order on Linux', () => {
      expect(
        enterprisePolicySearchPaths(
          {},
          'linux',
          '/home/dev/.config/Orca',
          false,
          '/opt/Orca/resources/enterprise-policy.json'
        )
      ).toEqual([
        MACHINE_WIDE_LINUX,
        '/opt/Orca/resources/enterprise-policy.json',
        '/home/dev/.config/Orca/enterprise-policy.json'
      ])
    })
  })

  // Only a packaged build has resources to bundle. If a bundled candidate could
  // appear here, config/vitest-enterprise-policy-isolation.ts would stop working and
  // the whole suite would run under lockdown on a corporate build machine.
  describe('with the environment override allowed (dev and vitest)', () => {
    it('omits the bundled candidate even when one is supplied', () => {
      expect(
        enterprisePolicySearchPaths(
          {},
          'linux',
          '/home/dev/.config/Orca',
          true,
          '/opt/Orca/resources/enterprise-policy.json'
        )
      ).toEqual([MACHINE_WIDE_LINUX, USER_LEVEL])
    })

    it('still resolves to no candidates at all for the suite opt-out', () => {
      expect(
        enterprisePolicySearchPaths(
          { [ENTERPRISE_POLICY_PATH_ENV]: 'off' },
          'linux',
          '/home/dev/.config/Orca',
          true,
          '/opt/Orca/resources/enterprise-policy.json'
        )
      ).toEqual([])
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

  // The installer ships a default policy so lockdown does not depend on a separate
  // fleet-deployment step. These cases pin the two bypasses that would undo that.
  describe('with a bundled default policy (packaged build)', () => {
    beforeEach(() => {
      electronApp.isPackaged = true
      stubResourcesPath(RESOURCES_DIR)
    })

    it('refuses to let an environment path override the bundled default', () => {
      vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/home/dev/open.json')
      readFileSyncMock.mockImplementation((target: string) => {
        if (target === BUNDLED) {
          return '{ "lockdown": true }'
        }
        return target === '/home/dev/open.json' ? '{ "lockdown": false }' : enoent()
      })
      const policy = getEnterprisePolicy()
      expect(policy.lockdown).toBe(true)
      expect(policy.sourcePath).toBe(BUNDLED)
    })

    it('refuses to let a per-user file override the bundled default', () => {
      vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '')
      readFileSyncMock.mockImplementation((target: string) => {
        if (target === BUNDLED) {
          return '{ "lockdown": true }'
        }
        return target === userLevelPath() ? '{ "lockdown": false }' : enoent()
      })
      const policy = getEnterprisePolicy()
      expect(policy.lockdown).toBe(true)
      expect(policy.sourcePath).toBe(BUNDLED)
    })

    // The bundled file must not close the door on central control.
    it('lets the machine-wide file an administrator deployed override the bundled default', () => {
      vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '')
      readFileSyncMock.mockImplementation((target: string) => {
        if (target === machineWidePath()) {
          return '{ "lockdown": false }'
        }
        return target === BUNDLED ? '{ "lockdown": true }' : enoent()
      })
      const policy = getEnterprisePolicy()
      expect(policy.lockdown).toBe(false)
      expect(policy.sourcePath).toBe(machineWidePath())
    })

    it('falls through to the per-user file when no bundled policy shipped', () => {
      vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '')
      readFileSyncMock.mockImplementation((target: string) =>
        target === userLevelPath() ? '{ "lockdown": true }' : enoent()
      )
      expect(getEnterprisePolicy().sourcePath).toBe(userLevelPath())
    })

    // The exact incident this guards: one typo in a GPO-deployed file used to leave
    // the machine completely unlocked, because parsing stopped the whole search.
    it('applies the bundled default when the machine-wide file is malformed', () => {
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '')
      readFileSyncMock.mockImplementation((target: string) => {
        if (target === machineWidePath()) {
          return '{ "lockdown": true '
        }
        return target === BUNDLED ? '{ "lockdown": true }' : enoent()
      })
      const policy = getEnterprisePolicy()
      expect(policy.lockdown).toBe(true)
      expect(policy.sourcePath).toBe(BUNDLED)
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'))
      stderr.mockRestore()
    })

    it('records the skipped candidate in the resolution trace', () => {
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '')
      readFileSyncMock.mockImplementation((target: string) => {
        if (target === machineWidePath()) {
          return '{ "lockdown": true '
        }
        return target === BUNDLED ? '{ "lockdown": true }' : enoent()
      })
      getEnterprisePolicy()
      const trace = getEnterprisePolicyResolutionTrace()
      expect(trace.searchedPaths).toContain(BUNDLED)
      expect(trace.notices).toContainEqual(
        expect.stringContaining(`${machineWidePath()} is not valid JSON`)
      )
      stderr.mockRestore()
    })
  })

  it('does not search a bundled path in an unpackaged build', () => {
    stubResourcesPath(RESOURCES_DIR)
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '')
    readFileSyncMock.mockImplementation((target: string) =>
      target === BUNDLED ? '{ "lockdown": true }' : enoent()
    )
    expect(getEnterprisePolicy().lockdown).toBe(false)
    expect(getEnterprisePolicyResolutionTrace().searchedPaths).not.toContain(BUNDLED)
  })

  it('still honors the opt-out in an unpackaged build so the suite can isolate itself', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, 'off')
    readFileSyncMock.mockReturnValue('{ "lockdown": true }')
    expect(getEnterprisePolicy().lockdown).toBe(false)
    expect(readFileSyncMock).not.toHaveBeenCalled()
  })

  // Counts reads of the policy path specifically: resolving also consults gh's own
  // hosts.yml for the GHES host fallback, which is a different file and a different read.
  it('reads the file once and caches the result', () => {
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '/opt/policy.json')
    readFileSyncMock.mockReturnValue('{ "lockdown": true }')
    expect(getEnterprisePolicy()).toBe(getEnterprisePolicy())
    expect(
      readFileSyncMock.mock.calls.filter(([target]) => target === '/opt/policy.json')
    ).toHaveLength(1)
  })
})

import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const readFileSyncMock = vi.fn<(target: string, encoding: string) => string>()

vi.mock('node:fs', () => ({
  readFileSync: (target: string, encoding: string) => readFileSyncMock(target, encoding)
}))

// `checkout.root` empty means "no checkout default resolvable", which is what every
// case except the dev-run ones wants — otherwise the fork's own resources/ policy
// would join the search in an unpackaged build and change unrelated expectations.
const { electronApp, checkout } = vi.hoisted(() => {
  const checkout = { root: '' }
  return {
    checkout,
    electronApp: {
      getPath: () => '/home/dev/.config/Orca',
      getAppPath: () => checkout.root,
      isPackaged: false
    }
  }
})
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
  checkout.root = ''
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
    it('keeps the checkout default as the last resort so a dev run is still locked down', () => {
      expect(
        enterprisePolicySearchPaths(
          {},
          'linux',
          '/home/dev/.config/Orca',
          true,
          '/checkout/resources/enterprise-policy.json'
        )
      ).toEqual([MACHINE_WIDE_LINUX, USER_LEVEL, '/checkout/resources/enterprise-policy.json'])
    })

    it('lets an explicit path replace the checkout default, so an unlocked A/B stays possible', () => {
      expect(
        enterprisePolicySearchPaths(
          { [ENTERPRISE_POLICY_PATH_ENV]: '/home/dev/relaxed.json' },
          'linux',
          '/home/dev/.config/Orca',
          true,
          '/checkout/resources/enterprise-policy.json'
        )
      ).toEqual(['/home/dev/relaxed.json'])
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

  // The compiled-in agent floor. `resources/enterprise-policy.json` lives in the install
  // directory, which a per-user NSIS install lets the standard user own, so these pin the
  // case the file baseline cannot reach: the file that was supposed to name the agents is gone.
  // The floor keys off ORCA_BUNDLED_MAIN_BUILD (see src/types/build-constants.d.ts), which
  // only an electron-vite bundle defines — vitest must opt in explicitly.
  describe('built-in agent allowlist floor', () => {
    beforeEach(() => {
      vi.stubGlobal('ORCA_BUNDLED_MAIN_BUILD', true)
      electronApp.isPackaged = true
      stubResourcesPath(RESOURCES_DIR)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('restricts agents in a bundled build even when no policy file is found', () => {
      readFileSyncMock.mockImplementation(enoent)

      const policy = getEnterprisePolicy()

      expect(policy.allowedAgents).toEqual(['claude', 'opencode'])
      expect(getEnterprisePolicyResolutionTrace().baselineAppliedKeys).toContain('allowedAgents')
    })

    it('restricts agents when the bundled file exists but no longer names them', () => {
      readFileSyncMock.mockImplementation((target: string) =>
        target === BUNDLED ? '{ "lockdown": true }' : enoent()
      )

      expect(getEnterprisePolicy().allowedAgents).toEqual(['claude', 'opencode'])
    })

    // Widening is the administrator's call, and the machine-wide file is the channel for it.
    it('yields to an explicit machine-wide list', () => {
      readFileSyncMock.mockImplementation((target: string) =>
        target === machineWidePath()
          ? '{ "lockdown": true, "allowedAgents": ["claude", "opencode", "codex"] }'
          : enoent()
      )

      expect(getEnterprisePolicy().allowedAgents).toEqual(['claude', 'opencode', 'codex'])
    })

    // A missing policy file must not be read as a lockdown — the floor names agents, nothing else.
    it('leaves every other switch alone', () => {
      readFileSyncMock.mockImplementation(enoent)

      expect(getEnterprisePolicy().lockdown).toBe(false)
    })
  })

  // Under vitest the constant is absent, which is what keeps the floor out of the ~47 upstream
  // PTY cases whose electron mock sets `isPackaged: true` for unrelated reasons.
  it('stays out of a run that is not an electron-vite bundle', () => {
    electronApp.isPackaged = true
    stubResourcesPath(RESOURCES_DIR)
    readFileSyncMock.mockImplementation(enoent)

    expect(getEnterprisePolicy().allowedAgents).toBeNull()
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

    // The reported fleet regression, end to end: an installed build whose bundled policy
    // restricts agents, and a %ProgramData% file deployed before that key existed.
    it('keeps the bundled agent allowlist when the machine-wide file predates the key', () => {
      readFileSyncMock.mockImplementation((target: string) => {
        if (target === machineWidePath()) {
          return '{ "lockdown": true, "githubEnterpriseHost": "ghes.example" }'
        }
        return target === BUNDLED ? '{ "allowedAgents": ["claude", "opencode"] }' : enoent()
      })

      const policy = getEnterprisePolicy()

      expect(policy.allowedAgents).toEqual(['claude', 'opencode'])
      // The admin's own file still owns everything it does set.
      expect(policy.sourcePath).toBe(machineWidePath())
      expect(policy.githubEnterpriseHost).toBe('ghes.example')
      const trace = getEnterprisePolicyResolutionTrace()
      expect(trace.baselinePath).toBe(BUNDLED)
      expect(trace.baselineAppliedKeys).toEqual(['allowedAgents'])
    })

    it('lets the machine-wide file choose a different allowlist', () => {
      readFileSyncMock.mockImplementation((target: string) => {
        if (target === machineWidePath()) {
          return '{ "lockdown": true, "allowedAgents": ["claude", "codex"] }'
        }
        return target === BUNDLED ? '{ "allowedAgents": ["claude", "opencode"] }' : enoent()
      })

      expect(getEnterprisePolicy().allowedAgents).toEqual(['claude', 'codex'])
      expect(getEnterprisePolicyResolutionTrace().baselineAppliedKeys).toEqual([])
    })

    // The install directory belongs to the user under per-user NSIS, so the bundled file
    // must not be a way to switch an administrator's lockdown back off.
    it('refuses to let the bundled file relax the machine-wide one', () => {
      readFileSyncMock.mockImplementation((target: string) => {
        if (target === machineWidePath()) {
          return '{ "lockdown": true }'
        }
        return target === BUNDLED ? '{ "lockdown": false, "disableVoice": false }' : enoent()
      })

      const policy = getEnterprisePolicy()

      expect(policy.lockdown).toBe(true)
      expect(policy.disableVoice).toBe(true)
    })

    // Valid JSON whose contents are not an object used to win the search outright, shutting
    // out the bundled default below it.
    it('falls through to the bundled default for a candidate that is not an object', () => {
      for (const contents of ['null', '[]', '"lockdown"', '42']) {
        resetEnterprisePolicyCacheForTests()
        readFileSyncMock.mockImplementation((target: string) => {
          if (target === machineWidePath()) {
            return contents
          }
          return target === BUNDLED ? '{ "allowedAgents": ["claude"] }' : enoent()
        })

        expect(getEnterprisePolicy().allowedAgents, contents).toEqual(['claude'])
      }
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

  it('does not search the installer resources path in an unpackaged build', () => {
    stubResourcesPath(RESOURCES_DIR)
    vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '')
    readFileSyncMock.mockImplementation((target: string) =>
      target === BUNDLED ? '{ "lockdown": true }' : enoent()
    )
    expect(getEnterprisePolicy().lockdown).toBe(false)
    expect(getEnterprisePolicyResolutionTrace().searchedPaths).not.toContain(BUNDLED)
  })

  // The regression this pair pins: `pnpm dev` used to resolve NO policy, so Settings →
  // Agents and the automation picker listed every vendor and looked like a broken gate.
  describe('with the fork checkout as the default (pnpm dev)', () => {
    const CHECKOUT_POLICY = path.join('/checkout', 'resources', 'enterprise-policy.json')

    beforeEach(() => {
      // What electron-vite's `electron out/main/index.js` actually reports, not the checkout.
      checkout.root = path.join('/checkout', 'out', 'main')
      vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, '')
    })

    it('also finds it when the launcher reports the checkout itself', () => {
      checkout.root = '/checkout'
      readFileSyncMock.mockImplementation((target: string) =>
        target === CHECKOUT_POLICY ? '{ "allowedAgents": ["claude"] }' : enoent()
      )
      expect(getEnterprisePolicy().allowedAgents).toEqual(['claude'])
    })

    it("applies the checkout's own policy so a dev run shows the fleet's agent list", () => {
      readFileSyncMock.mockImplementation((target: string) =>
        target === CHECKOUT_POLICY ? '{ "allowedAgents": ["claude", "opencode"] }' : enoent()
      )
      expect(getEnterprisePolicy().allowedAgents).toEqual(['claude', 'opencode'])
    })

    it("keeps a developer's per-user file above it", () => {
      readFileSyncMock.mockImplementation((target: string) => {
        if (target === userLevelPath()) {
          return '{ "allowedAgents": ["codex"] }'
        }
        return target === CHECKOUT_POLICY ? '{ "allowedAgents": ["claude"] }' : enoent()
      })
      expect(getEnterprisePolicy().allowedAgents).toEqual(['codex'])
    })
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

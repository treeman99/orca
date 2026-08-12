import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { detectCommandsMock, guideModuleLoadMock, runOfflineMock, runtimeClientConstructorMock } =
  vi.hoisted(() => ({
    detectCommandsMock: vi.fn(() => new Set<string>(['claude'])),
    guideModuleLoadMock: vi.fn(),
    runOfflineMock: vi.fn(
      async (): Promise<{ lines: string[]; failedNames: string[] }> => ({
        lines: ['alpha: wrote 2 location(s)'],
        failedNames: []
      })
    ),
    runtimeClientConstructorMock: vi.fn()
  }))

// Why: the offline installer writes into real agent home directories, so the handler
// tests assert the plan it is handed rather than letting it touch the test machine.
vi.mock('./handlers/skills-offline-install', () => ({
  runOfflineSkillMutation: runOfflineMock
}))

// Why: agent detection probes the real machine, so pin it or every install
// assertion depends on what the test runner happens to have installed.
vi.mock('../shared/local-agent-install-dir-detection', () => ({
  detectCommandsInInstallDirs: detectCommandsMock
}))

vi.mock('./bundled-skill-guides.js', () => {
  guideModuleLoadMock()
  return {
    BUNDLED_SKILL_GUIDES: [
      {
        name: 'zeta',
        description: 'Use when zeta work\nspans lines.',
        markdown: '# Zeta\n',
        fullMarkdown: '# Zeta\n\n## References\n\nZeta reference.\n',
        aliases: []
      },
      {
        name: 'alpha',
        description: 'Use when alpha work is needed.',
        markdown: '# Alpha\n\nShort.\n',
        fullMarkdown: '# Alpha\n\nShort.\n\n## References\n\nFull.\n',
        aliases: ['legacy-alpha']
      },
      {
        name: 'gamma',
        description:
          'Use when gamma work spans several sentences describing exactly how a ' +
          'coding agent should decide whether gamma applies to the current task at hand.',
        markdown: '# Gamma\n',
        fullMarkdown: '# Gamma\n\n## References\n\nGamma reference.\n',
        aliases: []
      }
    ]
  }
})

vi.mock('./runtime-client', async () => {
  // Why: re-export the REAL error classes rather than redefining them. format.ts
  // narrows with `instanceof` against ./runtime/types, so a look-alike class
  // here would make every CLI error fall through to the generic `runtime_error`
  // shape — mirroring the barrel keeps the mock faithful to production.
  const { RuntimeClientError, RuntimeRpcFailureError } = await import('./runtime/types.js')

  class RuntimeClient {
    constructor() {
      runtimeClientConstructorMock()
    }
  }

  return {
    RuntimeClient,
    RuntimeClientError,
    RuntimeRpcFailureError,
    serveOrcaApp: vi.fn(),
    getDefaultUserDataPath: vi.fn(() => '/tmp/orca-user-data')
  }
})

import { dispatch } from './dispatch'
import { main } from './index'

describe('orca skills CLI', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    runtimeClientConstructorMock.mockClear()
    detectCommandsMock.mockReset()
    detectCommandsMock.mockReturnValue(new Set<string>(['claude']))
    runOfflineMock.mockReset()
    runOfflineMock.mockResolvedValue({ lines: ['alpha: wrote 2 location(s)'], failedNames: [] })
    process.exitCode = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('keeps the bundled table off the eager command-registry path', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(guideModuleLoadMock).not.toHaveBeenCalled()
    await main(['status', '--help'], '/tmp/repo')
    expect(guideModuleLoadMock).not.toHaveBeenCalled()
  })

  it('dispatches an alias locally and emits the exact Markdown', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await dispatch(['skills', 'get'], {
      flags: new Map([['topic', 'legacy-alpha']]),
      get client(): never {
        throw new Error('skills get accessed RuntimeClient')
      },
      cwd: '/tmp/repo',
      json: false
    })

    expect(stdoutText(stdoutSpy)).toBe('# Alpha\n\nShort.\n')
  })

  it('lists canonical topics deterministically without constructing RuntimeClient', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'list'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      'alpha: Use when alpha work is needed.\n' +
        'gamma: Use when gamma work spans several sentences describing exactly how a ' +
        'coding agent should decide whether gamma applies to the current task at hand.\n' +
        'zeta: Use when zeta work spans lines.\n'
    )
    expect(runtimeClientConstructorMock).not.toHaveBeenCalled()
  })

  it('emits full Markdown for --full', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'get', 'alpha', '--full'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe('# Alpha\n\nShort.\n\n## References\n\nFull.\n')
  })

  it('supports the canonical single-item show verb as an alias', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'show', 'alpha'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe('# Alpha\n\nShort.\n')
  })

  it('gives list --json a stable canonical schema', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'list', '--json'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      `${JSON.stringify(
        {
          topics: [
            { name: 'alpha', description: 'Use when alpha work is needed.' },
            {
              name: 'gamma',
              description:
                'Use when gamma work spans several sentences describing exactly how a ' +
                'coding agent should decide whether gamma applies to the current task at hand.'
            },
            { name: 'zeta', description: 'Use when zeta work spans lines.' }
          ]
        },
        null,
        2
      )}\n`
    )
  })

  it('gives alias get --json the canonical name, selection, and Markdown', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'get', 'legacy-alpha', '--full', '--json'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      `${JSON.stringify(
        {
          name: 'alpha',
          full: true,
          markdown: '# Alpha\n\nShort.\n\n## References\n\nFull.\n'
        },
        null,
        2
      )}\n`
    )
  })

  it('shows leaf, group, and root help for skills', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['skills', 'get', '--help'], '/tmp/repo')
    await main(['skills', '--help'], '/tmp/repo')
    await main(['--help'], '/tmp/repo')

    expect(String(logSpy.mock.calls[0]?.[0])).toContain(
      'Usage: orca skills get <topic> [--full] [--json]'
    )
    expect(String(logSpy.mock.calls[1]?.[0])).toContain(
      'Commands:\n  list               List version-matched skill guides'
    )
    expect(String(logSpy.mock.calls[1]?.[0])).toContain(
      'get                Print a version-matched skill guide'
    )
    expect(String(logSpy.mock.calls[1]?.[0])).toContain(
      'install            Install bundled Orca skills'
    )
    expect(String(logSpy.mock.calls[1]?.[0])).toContain(
      'update             Refresh already-installed Orca skills from this build, with no network access'
    )
    expect(String(logSpy.mock.calls[2]?.[0])).toContain('Skills:\n  skills list')
    expect(String(logSpy.mock.calls[2]?.[0])).toContain('skills update')
    expect(runtimeClientConstructorMock).not.toHaveBeenCalled()
  })

  it('returns a nonzero error with all canonical topics for an unknown topic', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'get', 'missing'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(
      'Unknown skill topic "missing". Available topics: alpha, gamma, zeta'
    )
    expect(runtimeClientConstructorMock).not.toHaveBeenCalled()
  })

  it('lists installable skills when no --skill/--all is given', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      [
        'Choose one or more skills to install:',
        '  alpha',
        '  gamma',
        '  zeta',
        '',
        'Usage: orca skills install --skill <name> [--skill <name> ...]',
        '   or: orca skills install --all',
        ''
      ].join('\n')
    )
    expect(runOfflineMock).not.toHaveBeenCalled()
    expect(runtimeClientConstructorMock).not.toHaveBeenCalled()
  })

  it('gives install --json (no selection) a stable schema', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--json'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      `${JSON.stringify({ availableSkills: ['alpha', 'gamma', 'zeta'] }, null, 2)}\n`
    )
  })

  it('rejects combining --all with --skill', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--all', '--skill', 'alpha'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith('Use either --all or --skill, not both.')
    expect(runOfflineMock).not.toHaveBeenCalled()
  })

  it('rejects an unknown --skill name', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill', 'missing'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(
      'Unknown skill "missing". Available skills: alpha, gamma, zeta'
    )
    expect(runOfflineMock).not.toHaveBeenCalled()
  })

  it('rejects --skill without a value', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith('Missing required --skill')
    expect(runOfflineMock).not.toHaveBeenCalled()
  })

  it('emits JSON for a real install now that the output is its own', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'alpha', '--json'], '/tmp/repo')

    expect(process.exitCode).toBeUndefined()
    expect(JSON.parse(stdoutText(stdoutSpy))).toEqual({
      skills: ['alpha'],
      global: true,
      agents: ['claude-code', 'universal'],
      failed: []
    })
  })

  it('exits nonzero when a skill could not be written', async () => {
    runOfflineMock.mockResolvedValue({ lines: ['alpha: no files'], failedNames: ['alpha'] })
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'alpha'], '/tmp/repo')

    expect(process.exitCode).toBe(1)
  })

  it('prints the resolved plan without writing anything for --dry-run', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'alpha', '--dry-run'], '/tmp/repo')

    const printed = stdoutText(stdoutSpy)
    expect(printed).toContain('bundled packages (no network)')
    expect(printed).toContain('  alpha')
    expect(printed).toContain('scope: global')
    expect(printed).toContain('agents: claude-code, universal')
    expect(printed).toContain('Rerun without --dry-run to install now.')
    expect(runOfflineMock).not.toHaveBeenCalled()
  })

  it('gives dry-run --json a stable schema', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'legacy-alpha', '--dry-run', '--json'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      `${JSON.stringify(
        {
          skills: ['alpha'],
          global: true,
          agents: ['claude-code', 'universal'],
          executed: false
        },
        null,
        2
      )}\n`
    )
  })

  it('reports project scope for --local in the dry-run plan and JSON', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'alpha', '--local', '--dry-run'], '/tmp/repo')
    expect(stdoutText(stdoutSpy)).toContain('scope: project')

    stdoutSpy.mockClear()
    await main(
      ['skills', 'install', '--skill', 'alpha', '--local', '--dry-run', '--json'],
      '/tmp/repo'
    )

    expect(JSON.parse(stdoutText(stdoutSpy))).toMatchObject({ global: false, executed: false })
  })

  it('installs into the project scope for --local', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'alpha', '--local'], '/tmp/repo')

    expect(runOfflineMock).toHaveBeenCalledWith({
      verb: 'install',
      skillNames: ['alpha'],
      global: false,
      agentKeys: ['claude-code', 'universal']
    })
  })

  it('resolves a legacy topic alias to the canonical skill name for install', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'legacy-alpha'], '/tmp/repo')

    expect(runOfflineMock).toHaveBeenCalledWith(expect.objectContaining({ skillNames: ['alpha'] }))
  })

  it('installs every bundled skill for --all', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--all'], '/tmp/repo')

    expect(runOfflineMock).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'install', skillNames: ['alpha', 'gamma', 'zeta'] })
    )
  })

  it('lists updatable skills when no --skill/--all is given', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'update'], '/tmp/repo')

    expect(stdoutText(stdoutSpy)).toBe(
      [
        'Choose one or more skills to update:',
        '  alpha',
        '  gamma',
        '  zeta',
        '',
        'Usage: orca skills update --skill <name> [--skill <name> ...]',
        '   or: orca skills update --all',
        ''
      ].join('\n')
    )
    expect(runOfflineMock).not.toHaveBeenCalled()
  })

  it('prints the resolved update plan without writing anything for --dry-run', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'update', '--skill', 'legacy-alpha', '--dry-run'], '/tmp/repo')

    const printed = stdoutText(stdoutSpy)
    expect(printed).toContain('  alpha')
    expect(printed).toContain('Rerun without --dry-run to update now.')
    expect(runOfflineMock).not.toHaveBeenCalled()
  })

  it('selects project scope for --local on update', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(
      ['skills', 'update', '--skill', 'alpha', '--local', '--dry-run', '--json'],
      '/tmp/repo'
    )

    expect(JSON.parse(stdoutText(stdoutSpy))).toEqual({
      skills: ['alpha'],
      global: false,
      agents: [],
      executed: false
    })
  })

  it('runs local updates with explicit project scope', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'update', '--skill', 'alpha', '--local'], '/tmp/repo')

    expect(runOfflineMock).toHaveBeenCalledWith({
      verb: 'update',
      skillNames: ['alpha'],
      global: false,
      agentKeys: []
    })
  })

  it('refuses a real run when the shell forwards orca to the Orca host', async () => {
    vi.stubEnv('ORCA_CLI_CWD', '/home/alice/wt')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill', 'alpha'], '/tmp/repo')

    // Why: the SSH relay and WSL bridge run argv on the Orca host, so a real
    // install there would silently skip the machine the user is sitting on.
    expect(runOfflineMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('writes to the machine that runs it')
  })

  it('refuses --dry-run through the host-forwarding shim too', async () => {
    vi.stubEnv('ORCA_CLI_CWD', '/home/alice/wt')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill', 'alpha', '--dry-run'], '/tmp/repo')

    // Why: the targets are resolved from THIS host's agents, so a command printed
    // here would name the wrong machine's agents. Point at the target instead.
    expect(runOfflineMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('writes to the machine that runs it')
  })

  it('refuses to install when Orca detects no agent, instead of targeting them all', async () => {
    detectCommandsMock.mockReturnValue(new Set<string>())
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill', 'alpha'], '/tmp/repo')

    // Why: `skills add -y` with nothing detected installs into every agent it
    // knows (~75), creating config dirs for agents the host does not have.
    expect(runOfflineMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('No coding agent detected')
  })

  it('honours an explicit --agent list without probing the host', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    detectCommandsMock.mockReturnValue(new Set<string>())

    await main(
      ['skills', 'install', '--skill', 'alpha', '--agent', 'codex, claude-code ,codex'],
      '/tmp/repo'
    )

    // Why: trimmed and de-duplicated, and detection is not consulted at all.
    expect(runOfflineMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentKeys: ['codex', 'claude-code'] })
    )
    expect(detectCommandsMock).not.toHaveBeenCalled()
  })

  it('rejects an agent Orca has no skills directory for', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill', 'alpha', '--agent', 'nonesuch'], '/tmp/repo')

    // Why: the offline installer only writes roots Orca also scans, so an agent it
    // has no root for would report success while installing nothing.
    expect(runOfflineMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('no skills directory for agent')
  })

  it('maps detected agents onto the skills CLI namespace, not Orca ids', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    detectCommandsMock.mockReturnValue(new Set<string>(['claude', 'cursor-agent', 'rovo']))

    await main(['skills', 'install', '--skill', 'alpha', '--dry-run'], '/tmp/repo')

    // Why: Orca's ids and the skills namespace differ — its `claude` is `claude-code`.
    // `rovodev` is dropped here because Orca scans no Rovo skills directory.
    expect(stdoutText(stdoutSpy)).toContain('agents: claude-code, cursor, universal')
  })

  it('chooses no new targets for an update, and never refuses on a bare host', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    // Why: update refreshes what is already placed, so the no-agent refusal that
    // guards install must not reach it.
    detectCommandsMock.mockReturnValue(new Set<string>())

    await main(['skills', 'update', '--skill', 'alpha'], '/tmp/repo')

    expect(runOfflineMock).toHaveBeenCalledWith(expect.objectContaining({ agentKeys: [] }))
  })

  it.each([
    ['a bare --agent', ['skills', 'install', '--skill', 'alpha', '--agent']],
    ['an empty --agent', ['skills', 'install', '--skill', 'alpha', '--agent', '']],
    ['a separator-only --agent', ['skills', 'install', '--skill', 'alpha', '--agent', ' , ,']]
  ])('rejects %s instead of installing to every agent', async (_label, argv) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(argv, '/tmp/repo')

    // Why: an --agent that resolves to nothing must not fall back to detection or
    // emit no --agent at all — the latter restores the ~75-agent install.
    expect(runOfflineMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('Missing required --agent')
  })

  it.each([
    ['a dash-leading value', ['skills', 'install', '--skill', 'alpha', '--agent', '-y']],
    ['an inline dash value', ['skills', 'install', '--skill', 'alpha', '--agent=--copy']],
    ['a value with a space', ['skills', 'install', '--skill', 'alpha', '--agent', 'a b']]
  ])('rejects %s the skills CLI would silently drop', async (_label, argv) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(argv, '/tmp/repo')

    // Why: the skills CLI drops such a value, leaving it with no target — the same
    // all-agents install as omitting --agent entirely.
    expect(runOfflineMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('Invalid --agent value')
  })

  it('reports forwarding, not missing agents, when a forwarded host detects none', async () => {
    vi.stubEnv('ORCA_CLI_CWD', '/home/alice/wt')
    detectCommandsMock.mockReturnValue(new Set<string>())
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main(['skills', 'install', '--skill', 'alpha'], '/tmp/repo')

    // Why: resolving targets first would hide the forwarding problem behind a
    // no-agent error about the wrong machine.
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('writes to the machine that runs it')
  })

  it('documents --agent for skills install rather than the terminal-launch flag', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['skills', 'install', '--help'], '/tmp/repo')

    const help = String(logSpy.mock.calls[0]?.[0])
    expect(help).toContain('--agent <names>')
    expect(help).not.toContain('Launch a known TUI agent')
  })

  it('accumulates a repeated --skill instead of keeping only the last one', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'install', '--skill', 'zeta', '--skill', 'alpha'], '/tmp/repo')

    // Why: the documented primary invocation. Dropping 'skill' from the
    // repeatable-flag set silently installs one skill instead of two.
    expect(runOfflineMock).toHaveBeenCalledWith(
      expect.objectContaining({ skillNames: ['alpha', 'zeta'] })
    )
  })

  it('collapses an alias and its canonical name into one skill', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(
      ['skills', 'install', '--skill', 'alpha', '--skill', 'legacy-alpha', '--dry-run'],
      '/tmp/repo'
    )

    expect(stdoutText(stdoutSpy).match(/^ {2}alpha$/gm)).toHaveLength(1)
    expect(runOfflineMock).not.toHaveBeenCalled()
  })

  it('updates every bundled skill for --all', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'update', '--all'], '/tmp/repo')

    expect(runOfflineMock).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'update', skillNames: ['alpha', 'gamma', 'zeta'] })
    )
  })

  it('emits JSON for a real update too', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main(['skills', 'update', '--skill', 'alpha', '--json'], '/tmp/repo')

    expect(process.exitCode).toBeUndefined()
    expect(JSON.parse(stdoutText(stdoutSpy))).toEqual({
      skills: ['alpha'],
      global: true,
      agents: [],
      failed: []
    })
  })
})

function stdoutText(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((call) => String(call[0])).join('')
}

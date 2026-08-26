// Behavioural tests for the corporate `allowedAgents` gate on the managed-hook install paths.
// They drive the main-only wrapper, not the install chokepoint directly, because the wrapper is
// what reads the policy — a test against the chokepoint alone would pass with the injection cut.
// Each restricted case has a no-policy twin: an upstream build (`allowedAgents: null`) must
// still install every agent's hooks exactly as before.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentHookInstallStatus, AgentHookTarget } from '../../shared/agent-hook-types'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  detect: vi.fn(),
  installClaude: vi.fn(),
  installGemini: vi.fn(),
  installCursor: vi.fn(),
  refreshClaude: vi.fn(),
  refreshGemini: vi.fn(),
  sweep: vi.fn()
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

vi.mock('./local-agent-cli-presence', () => ({
  detectLocalManagedAgentCliPresence: mocks.detect
}))

// The sweep has its own behavioural tests; stub it so these never touch the real ~/.orca.
vi.mock('./enterprise-agent-hook-sweep', () => ({
  sweepEnterpriseBlockedAgentHooks: mocks.sweep
}))

vi.mock('./managed-agent-hook-registry', () => ({
  MANAGED_AGENT_HOOK_INSTALLERS: [
    ['claude', mocks.installClaude],
    ['gemini', mocks.installGemini],
    ['cursor', mocks.installCursor]
  ],
  MANAGED_AGENT_HOOK_REMOVERS: [],
  MANAGED_AGENT_HOOK_STATUS_READERS: [],
  MANAGED_AGENT_HOOK_SCRIPT_REFRESHERS: [
    ['claude', mocks.refreshClaude],
    ['gemini', mocks.refreshGemini]
  ]
}))

// Why spies, not a module mock: openclaude/hook-service builds on ClaudeHookService, so
// replacing the module wholesale breaks the remote installer's own import graph.
import { claudeHookService } from '../claude/hook-service'
import { geminiHookService } from '../gemini/hook-service'
import { applyAgentStatusHooksEnabledUnderEnterprisePolicy } from './enterprise-agent-hook-policy'
import { installRemoteManagedAgentHooks } from './remote-managed-hook-installers'

function installedStatus(agent: AgentHookTarget): AgentHookInstallStatus {
  return {
    agent,
    state: 'installed',
    configPath: `/${agent}`,
    managedHooksPresent: true,
    detail: null
  }
}

function applyHooks(): Promise<AgentHookInstallStatus[]> {
  return applyAgentStatusHooksEnabledUnderEnterprisePolicy(true, { agentCmdOverrides: {} })
}

describe('managed agent hook enterprise policy gate', () => {
  let installRemoteClaude: ReturnType<typeof vi.spyOn>
  let installRemoteGemini: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.installClaude.mockReturnValue(installedStatus('claude'))
    mocks.installGemini.mockReturnValue(installedStatus('gemini'))
    mocks.installCursor.mockReturnValue(installedStatus('cursor'))
    mocks.refreshClaude.mockResolvedValue(undefined)
    mocks.refreshGemini.mockResolvedValue(undefined)
    installRemoteClaude = vi
      .spyOn(claudeHookService, 'installRemote')
      .mockResolvedValue(installedStatus('claude'))
    installRemoteGemini = vi
      .spyOn(geminiHookService, 'installRemote')
      .mockResolvedValue(installedStatus('gemini'))
    mocks.detect.mockResolvedValue({
      claude: { state: 'found' },
      gemini: { state: 'found' },
      cursor: { state: 'found' }
    })
  })

  it('installs only the agents the policy allows, and reports the rest as blocked', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeLockdownPolicy({ allowedAgents: ['claude', 'opencode'] })
    )

    const results = await applyHooks()

    expect(mocks.installClaude).toHaveBeenCalledTimes(1)
    expect(mocks.installGemini).not.toHaveBeenCalled()
    expect(mocks.installCursor).not.toHaveBeenCalled()
    expect(results).toEqual([
      expect.objectContaining({ agent: 'claude', state: 'installed' }),
      expect.objectContaining({
        agent: 'gemini',
        state: 'skipped',
        skipReason: 'agent_blocked_by_policy'
      }),
      expect.objectContaining({
        agent: 'cursor',
        state: 'skipped',
        skipReason: 'agent_blocked_by_policy'
      })
    ])
  })

  it('sweeps before it installs, on both the on and the off branch', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )

    await applyHooks()
    await applyAgentStatusHooksEnabledUnderEnterprisePolicy(false)

    expect(mocks.sweep).toHaveBeenCalledTimes(2)
  })

  it('does not refresh an existing launcher for a blocked agent', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )

    await applyHooks()

    expect(mocks.refreshClaude).toHaveBeenCalledTimes(1)
    expect(mocks.refreshGemini).not.toHaveBeenCalled()
  })

  it('reports blocked (not unknown) when CLI detection also fails', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    mocks.detect.mockRejectedValue(new Error('detection unavailable'))

    const results = await applyHooks()

    expect(results).toEqual([
      expect.objectContaining({ agent: 'claude', skipReason: 'cli_presence_unknown' }),
      expect.objectContaining({ agent: 'gemini', skipReason: 'agent_blocked_by_policy' }),
      expect.objectContaining({ agent: 'cursor', skipReason: 'agent_blocked_by_policy' })
    ])
  })

  it('installs every agent when the policy sets no allowlist', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())

    const results = await applyHooks()

    expect(mocks.installClaude).toHaveBeenCalledTimes(1)
    expect(mocks.installGemini).toHaveBeenCalledTimes(1)
    expect(mocks.installCursor).toHaveBeenCalledTimes(1)
    expect(mocks.refreshGemini).toHaveBeenCalledTimes(1)
    expect(results.every((status) => status.state === 'installed')).toBe(true)
  })

  it('skips a policy-blocked agent on the remote (SSH/WSL) install path', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )

    const results = await installRemoteManagedAgentHooks({} as never, '/home/dev', {
      agents: ['claude', 'gemini']
    })

    expect(installRemoteClaude).toHaveBeenCalledTimes(1)
    expect(installRemoteGemini).not.toHaveBeenCalled()
    expect(results).toEqual([expect.objectContaining({ agent: 'claude' })])
  })

  it('installs both remote agents when the policy sets no allowlist', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())

    const results = await installRemoteManagedAgentHooks({} as never, '/home/dev', {
      agents: ['claude', 'gemini']
    })

    expect(installRemoteGemini).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(2)
  })
})

// Behavioural tests for the corporate agent allowlist on the main-process launch paths.
//
// Every one of these is reachable without the renderer: `orca worktree create --agent`,
// `orca terminal create --agent`, a paired mobile client resuming a session, and an
// orchestration dispatch. Hiding the agent in a picker does nothing for any of them, so
// each proves an actual refusal — and each has a no-policy twin proving upstream behavior
// is untouched when `allowedAgents` is null.

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { getDefaultSettings } from '../../shared/constants'
import type { GlobalSettings } from '../../shared/global-settings-types'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

vi.mock('../git/worktree', () => ({
  listWorktrees: vi.fn().mockResolvedValue([]),
  listWorktreesStrict: vi.fn().mockResolvedValue([])
}))

import { OrcaRuntimeService } from './orca-runtime'

const BLOCKED = /agent_blocked_by_enterprise_policy/

function makeRuntime(): OrcaRuntimeService {
  const settings: GlobalSettings = getDefaultSettings('/tmp/orca-test-home')
  return new OrcaRuntimeService({
    getSettings: () => settings
  } as never)
}

function restrictToClaudeAndOpenCode(): void {
  getEnterprisePolicyMock.mockReturnValue(
    makeLockdownPolicy({ allowedAgents: ['claude', 'opencode'] })
  )
}

// A create request that the policy gate must reject before anything is resolved.
function createAgentSessionRequest(
  agent: string
): Parameters<OrcaRuntimeService['createAgentSession']>[0] {
  return {
    clientOperationId: `${Date.now()}-0000-4000-8000-000000000000`,
    worktree: 'id:worktree-1',
    agent
  } as Parameters<OrcaRuntimeService['createAgentSession']>[0]
}

function ensureAgentSessionRequest(
  agent: string
): Parameters<OrcaRuntimeService['ensureAgentSession']>[0] {
  return {
    kind: 'explicit',
    worktree: 'id:worktree-1',
    agent,
    providerSession: { key: 'session_id', id: 'session-1' }
  } as Parameters<OrcaRuntimeService['ensureAgentSession']>[0]
}

function createManagedWorktreeArgs(
  agent: string
): Parameters<OrcaRuntimeService['createManagedWorktree']>[0] {
  return {
    repoSelector: 'repo-1',
    name: 'feature',
    startupAgent: agent
  } as Parameters<OrcaRuntimeService['createManagedWorktree']>[0]
}

beforeEach(() => {
  getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
})

describe('terminal.createAgentSession under the agent allowlist', () => {
  it('refuses a blocked agent before it can reserve an operation slot', async () => {
    restrictToClaudeAndOpenCode()
    await expect(
      makeRuntime().createAgentSession(createAgentSessionRequest('codex'))
    ).rejects.toThrow(BLOCKED)
  })

  it('lets an allowed agent past the policy gate', async () => {
    restrictToClaudeAndOpenCode()
    // Resolution fails on the stub store, which is fine: the point is that it got past
    // the gate rather than being refused by it.
    await expect(
      makeRuntime().createAgentSession(createAgentSessionRequest('claude'))
    ).rejects.not.toThrow(BLOCKED)
  })

  it('does not narrow when no allowlist is configured', async () => {
    await expect(
      makeRuntime().createAgentSession(createAgentSessionRequest('codex'))
    ).rejects.not.toThrow(BLOCKED)
  })
})

describe('terminal.ensureAgentSession under the agent allowlist', () => {
  it('refuses resuming a session for a blocked agent', async () => {
    restrictToClaudeAndOpenCode()
    await expect(
      makeRuntime().ensureAgentSession(ensureAgentSessionRequest('codex'))
    ).rejects.toThrow(BLOCKED)
  })

  it('does not narrow when no allowlist is configured', async () => {
    await expect(
      makeRuntime().ensureAgentSession(ensureAgentSessionRequest('codex'))
    ).rejects.not.toThrow(BLOCKED)
  })
})

describe('worktree.create --agent under the agent allowlist', () => {
  it('refuses a blocked agent before any worktree exists', async () => {
    restrictToClaudeAndOpenCode()
    await expect(
      makeRuntime().createManagedWorktree(createManagedWorktreeArgs('codex'))
    ).rejects.toThrow(BLOCKED)
  })

  it('does not narrow when no allowlist is configured', async () => {
    await expect(
      makeRuntime().createManagedWorktree(createManagedWorktreeArgs('codex'))
    ).rejects.not.toThrow(BLOCKED)
  })
})

describe('orchestration dispatch under the agent allowlist', () => {
  it('refuses to dispatch a worker onto a blocked agent launcher', () => {
    restrictToClaudeAndOpenCode()
    expect(() => makeRuntime().validateOrchestrationAgentLauncher('codex')).toThrow(
      /not permitted by your organization/
    )
  })

  it('still dispatches onto an allowed launcher', () => {
    restrictToClaudeAndOpenCode()
    expect(() => makeRuntime().validateOrchestrationAgentLauncher('claude')).not.toThrow()
  })

  it('does not narrow when no allowlist is configured', () => {
    expect(() => makeRuntime().validateOrchestrationAgentLauncher('codex')).not.toThrow()
  })
})

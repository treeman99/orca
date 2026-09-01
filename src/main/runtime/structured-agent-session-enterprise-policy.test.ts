// Behavioural tests for the corporate `allowedAgents` gate on the structured agent-session lane.
//
// This lane is not a PTY: `agentSession.*` reaches `codex app-server` through `spawnProcess`, so
// none of the fork's PTY-side refusals see it. Two chokepoints enforce it — the attach funnel and
// the codex spawn resolver — and the create-support probe refuses too, so a remote client that
// asks first is told no instead of being handed a host it made exist. (The desktop path does not
// probe; its narrowing lives in structured-native-chat-availability.test.ts.) The enforcing cases
// have a no-policy twin: an upstream build (`allowedAgents: null`) must behave exactly as before.
//
// Delete a gate and its own case must go red. That was verified one gate at a time when they
// landed (attach 2 cases, spawn 1, probe 1); keep it true, because a resolver test proves the
// policy object is right, not that anything consumes it.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'

import type * as EnterprisePolicyFileModule from '../enterprise/enterprise-policy-file'

const mocks = vi.hoisted(() => ({ getEnterprisePolicy: vi.fn() }))

// Why importOriginal: the module also owns the resolution trace and the cache reset, and other
// modules in this graph import those. Only the policy read is swapped.
vi.mock('../enterprise/enterprise-policy-file', async (importOriginal) => ({
  ...(await importOriginal<typeof EnterprisePolicyFileModule>()),
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

import { createCodexStructuredLaunchResolver } from '../codex/codex-structured-launch-resolution'
import { attachStructuredAgentSession } from '../native-chat/agent-session-wire/structured-agent-session-attach-orchestration'
import { OrcaRuntimeService } from './orca-runtime'

const BLOCKED = /agent_blocked_by_enterprise_policy/

/** A lockdown file that does not list codex. `allowedAgents` never inherits `lockdown`, so the
 *  restriction has to be spelled out — exactly as the shipped fleet policy spells it out. */
function codexNotAllowed(): void {
  mocks.getEnterprisePolicy.mockReturnValue(
    makeLockdownPolicy({ allowedAgents: ['claude', 'opencode'] })
  )
}

function upstreamBuild(): void {
  mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy({ allowedAgents: null }))
}

// --- chokepoint 1: the attach funnel -------------------------------------------------------

const ATTACH_REACHED = Symbol('attach reached')

function attachContext(): Parameters<typeof attachStructuredAgentSession>[0] {
  // Stops at the first collaborator: reaching `serialize` already proves the gate let it past,
  // and running the real attach would need a store, a journal and a lease.
  return {
    serialize: vi.fn(() => Promise.resolve(ATTACH_REACHED)),
    tasks: { trackAttach: (attaching: unknown) => attaching }
  } as unknown as Parameters<typeof attachStructuredAgentSession>[0]
}

function attachParams(agent: string): Parameters<typeof attachStructuredAgentSession>[2] {
  return {
    envelope: { sessionId: 'session-1', clientOperationId: 'operation-1' },
    location: { executionHostId: LOCAL_EXECUTION_HOST_ID, wslDistro: null },
    provider: agent,
    agent,
    accountHome: { variable: 'CODEX_HOME', path: '/home/codex' },
    runtimeKind: 'native'
  } as unknown as Parameters<typeof attachStructuredAgentSession>[2]
}

// --- chokepoint 2: the codex spawn resolver ------------------------------------------------

function codexRecord(): AgentSessionRecord {
  return {
    sessionId: 'session-1',
    provider: 'codex',
    providerHandleChain: [],
    location: { executionHostId: LOCAL_EXECUTION_HOST_ID, wslDistro: null, workspaceId: 'w1' },
    accountHome: { variable: 'CODEX_HOME', path: '/home/codex' }
  } as unknown as AgentSessionRecord
}

function codexResolver(): ReturnType<typeof createCodexStructuredLaunchResolver> {
  return createCodexStructuredLaunchResolver({
    store: { getRecord: () => codexRecord() },
    resolveWorkspacePath: async () => '/repos/w1',
    resolveCommand: () => '/usr/local/bin/codex',
    resolveEnvironment: async () => ({ PATH: '/usr/local/bin' })
  } as unknown as Parameters<typeof createCodexStructuredLaunchResolver>[0])
}

function launch(): Promise<unknown> {
  return codexResolver()({ identity: { sessionId: 'session-1' } as never })
}

describe('structured agent-session enterprise policy gate', () => {
  beforeEach(() => {
    mocks.getEnterprisePolicy.mockReset()
  })

  describe('attach funnel', () => {
    it('refuses a session for an agent the policy does not list', async () => {
      codexNotAllowed()

      await expect(
        attachStructuredAgentSession(attachContext(), 'caller-1', attachParams('codex'))
      ).rejects.toThrow(BLOCKED)
    })

    it('refuses before the session is reserved', async () => {
      codexNotAllowed()
      const context = attachContext()

      await expect(
        attachStructuredAgentSession(context, 'caller-1', attachParams('codex'))
      ).rejects.toThrow(BLOCKED)

      // Nothing was serialized, so no record, journal or idempotency row was left behind.
      expect(context.serialize).not.toHaveBeenCalled()
    })

    it('admits an agent the policy does list', async () => {
      codexNotAllowed()

      await expect(
        attachStructuredAgentSession(attachContext(), 'caller-1', attachParams('claude'))
      ).resolves.toBe(ATTACH_REACHED)
    })

    it('admits every agent on an upstream build with no policy file', async () => {
      upstreamBuild()

      await expect(
        attachStructuredAgentSession(attachContext(), 'caller-1', attachParams('codex'))
      ).resolves.toBe(ATTACH_REACHED)
    })
  })

  describe('codex spawn resolver', () => {
    it('refuses to build a launch for a blocked agent', async () => {
      codexNotAllowed()

      await expect(launch()).rejects.toThrow(BLOCKED)
    })

    it('builds the launch on an upstream build with no policy file', async () => {
      upstreamBuild()

      await expect(launch()).resolves.toMatchObject({
        command: '/usr/local/bin/codex',
        args: ['app-server'],
        cwd: '/repos/w1'
      })
    })
  })

  describe('create-support probe', () => {
    function runtime(): OrcaRuntimeService {
      const service = new OrcaRuntimeService({ getSettings: () => ({}) } as never)
      const internal = service as unknown as {
        resolveStructuredAgentSessionLocation: () => Promise<unknown>
        ensureStructuredAgentSessionHost: () => Promise<void>
      }
      internal.resolveStructuredAgentSessionLocation = vi.fn(async () => {
        throw new Error('the probe must refuse before resolving a location')
      })
      internal.ensureStructuredAgentSessionHost = vi.fn(async () => {
        throw new Error('a blocked agent must not make the structured host exist')
      })
      return service
    }

    it('reports the agent as unsupported instead of throwing on click', async () => {
      codexNotAllowed()

      await expect(
        runtime().getStructuredAgentSessionCreateSupport('id:w1', 'codex')
      ).resolves.toEqual({ supported: false, reason: 'agent' })
    })
  })
})

// Fork-owned: the allowlist refusal on the ACP (Grok) structured resolver. The attach funnel is
// provider-agnostic and already refuses a new session, but a stored record relaunches through
// this resolver on wake and restart restore without attaching again (v1.4.223 added the lane).
import { describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import { agentSessionRecordFixture } from '../../shared/agent-session-record.test-fixture'
import type * as EnterprisePolicyFileModule from '../enterprise/enterprise-policy-file'

const mocks = vi.hoisted(() => ({ getEnterprisePolicy: vi.fn() }))

vi.mock('../enterprise/enterprise-policy-file', async (importOriginal) => ({
  ...(await importOriginal<typeof EnterprisePolicyFileModule>()),
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

import { acpLaunchSpecFor } from './acp-launch-specs'
import { createAcpStructuredLaunchResolver } from './acp-structured-launch-resolution'

const GROK = acpLaunchSpecFor('grok')!
const BLOCKED = /agent_blocked_by_enterprise_policy/

function grokRecord(): AgentSessionRecord {
  return {
    ...agentSessionRecordFixture(),
    provider: 'grok',
    providerHandleChain: [],
    accountHome: { variable: 'GROK_HOME', path: '/home/user/.grok-work' }
  }
}

function launch(): Promise<unknown> {
  return createAcpStructuredLaunchResolver(GROK, {
    store: { getRecord: () => grokRecord() },
    readJournal: () => null,
    resolveWorkspacePath: async () => '/repo/worktree',
    resolveEnvironment: async () => ({ PATH: '/usr/bin', HOME: '/home/user' }),
    resolveCommand: (command) => `/resolved/${command}`
  })({ identity: { sessionId: grokRecord().sessionId } as never })
}

describe('ACP structured launch resolver enterprise policy', () => {
  it('refuses to relaunch a stored grok session the policy does not list', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeLockdownPolicy({ allowedAgents: ['claude', 'opencode'] })
    )

    await expect(launch()).rejects.toThrow(BLOCKED)
  })

  it('builds the launch on an upstream build with no policy file', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy({ allowedAgents: null }))

    await expect(launch()).resolves.toMatchObject({ command: '/resolved/grok' })
  })
})

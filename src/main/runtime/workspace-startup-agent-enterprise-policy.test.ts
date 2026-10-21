// Fork-owned: every new workspace that starts an agent (worktree create --agent, terminal create
// with an agent) builds its startup in buildStartupForAgent. v1.4.232 filled the file defining it to
// its max-lines cap, so the allowedAgents gate is an override at the fork's tail of the chain.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

vi.mock('../git/worktree', () => ({
  listWorktrees: vi.fn().mockResolvedValue([]),
  listWorktreesStrict: vi.fn().mockResolvedValue([])
}))

import { OrcaRuntimeService } from './orca-runtime'

type StartupInternals = { buildStartupForAgent: (repo: unknown, agent: string) => unknown }

function buildStartup(agent: string): () => unknown {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: reaching a protected runtime method the RPC and worktree lanes call.
  const runtime = new OrcaRuntimeService() as unknown as StartupInternals
  return () => runtime.buildStartupForAgent({ id: 'repo-1', path: '/tmp/repo' }, agent)
}

describe('workspace agent startup under the enterprise policy', () => {
  beforeEach(() => {
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
  })

  it('refuses to build a startup for an agent the policy does not list', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))

    expect(buildStartup('codex')).toThrow(/agent_blocked_by_enterprise_policy/)
  })

  it('lets an allowed agent past the gate', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))

    // Why not a success assertion: no store is wired, so passing the gate surfaces as upstream's
    // own "runtime unavailable" refusal instead.
    expect(buildStartup('claude')).toThrow('runtime_unavailable')
  })
})

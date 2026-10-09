// Fork-owned: v1.4.223's Codex hook reconcile runs `codex --version`/`app-server` and writes
// ~/.codex on app start and every native PTY spawn. Its only switch is the predicate main hands it,
// so that predicate must refuse a codex the policy does not allow.
import { describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const mocks = vi.hoisted(() => ({ getEnterprisePolicy: vi.fn() }))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

import { isCodexHookReconcileEnabledUnderEnterprisePolicy } from './enterprise-agent-hook-policy'

describe('codex hook reconcile under the enterprise policy', () => {
  it('stays off for a fleet that does not allow codex, even with hooks on', () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeLockdownPolicy({ allowedAgents: ['claude', 'opencode'] })
    )

    expect(
      isCodexHookReconcileEnabledUnderEnterprisePolicy({ agentStatusHooksEnabled: true })
    ).toBe(false)
  })

  it('follows the hooks setting on an upstream build with no policy file', () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy({ allowedAgents: null }))

    expect(
      isCodexHookReconcileEnabledUnderEnterprisePolicy({ agentStatusHooksEnabled: true })
    ).toBe(true)
    expect(
      isCodexHookReconcileEnabledUnderEnterprisePolicy({ agentStatusHooksEnabled: false })
    ).toBe(false)
  })
})

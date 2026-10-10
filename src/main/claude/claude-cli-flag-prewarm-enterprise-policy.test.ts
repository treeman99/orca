// The startup `claude --version` prewarm under the corporate `allowedAgents` gate. v1.4.224 added
// the prewarm beside the structured host install; it resolves the CLI without a session record, so
// the per-record refusal in the launch resolver never sees it.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { prewarmClaudeCliFlags } from './claude-cli-flag-prewarm'

const mocks = vi.hoisted(() => ({ getEnterprisePolicy: vi.fn() }))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

async function prewarm(): Promise<{ prewarm: ReturnType<typeof vi.fn>; resolved: number }> {
  const spy = vi.fn()
  let resolved = 0
  await prewarmClaudeCliFlags({
    cliFlags: { prewarm: spy },
    store: { listVisibleSessionIds: () => [], getRecord: () => null },
    resolveCommand: () => {
      resolved += 1
      return '/bin/claude'
    },
    resolveEnv: () => ({ PATH: '/shims' }),
    resolveInheritedEnv: async () => ({ PATH: '/usr/bin' })
  })
  return { prewarm: spy, resolved }
}

describe('the Claude version prewarm under the corporate agent allowlist', () => {
  beforeEach(() => {
    mocks.getEnterprisePolicy.mockReset()
  })

  it('never resolves or probes claude when the policy does not allow it', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['codex'] }))

    const result = await prewarm()

    expect(result.resolved).toBe(0)
    expect(result.prewarm).not.toHaveBeenCalled()
  })

  it('probes claude when no allowlist is set', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())

    const result = await prewarm()

    expect(result.prewarm).toHaveBeenCalled()
  })
})

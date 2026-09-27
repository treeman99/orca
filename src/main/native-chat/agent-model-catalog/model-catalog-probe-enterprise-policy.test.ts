// Behavioural tests for the corporate `allowedAgents` gate on the session-less model catalog
// probes. They drive the real probe factories, because the probes reach the CLI through
// resolve*StructuredInvocation and never meet the per-record gate in the session launchers.
// Each refused case has an allowed twin so a gate that refuses everything still fails.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../../shared/enterprise-policy-fixture'
import { createClaudeModelCatalogProbe } from '../../claude/claude-model-catalog-probe'
import { createCodexModelCatalogProbe } from '../../codex/codex-model-catalog-probe'

const mocks = vi.hoisted(() => ({ getEnterprisePolicy: vi.fn() }))

vi.mock('../../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

type CodexProbeDeps = Parameters<typeof createCodexModelCatalogProbe>[0]
type ClaudeProbeDeps = Parameters<typeof createClaudeModelCatalogProbe>[0]

function codexProbe(runSession: NonNullable<CodexProbeDeps['runSession']>) {
  return createCodexModelCatalogProbe({
    resolveEnvironment: async () => ({ PATH: '/bin', HOME: '/home/user' }),
    resolveCommand: () => '/bin/codex',
    runSession
  })
}

// A plain function, not vi.fn: runSession is generic, and a Mock cannot stand in for `<T>`.
function countingRunSession(): {
  runSession: NonNullable<CodexProbeDeps['runSession']>
  started: () => number
} {
  let count = 0
  return {
    runSession: async () => {
      count += 1
      throw new Error('listing stubbed out')
    },
    started: () => count
  }
}

function claudeProbe(discover: NonNullable<ClaudeProbeDeps['discover']>) {
  return createClaudeModelCatalogProbe({
    resolveCommand: () => '/bin/claude',
    resolveInheritedEnv: async () => ({ PATH: '/bin', HOME: '/home/user' }),
    resolveAuthPolicy: () => ({ stripAuthEnv: false }),
    discover
  })
}

describe('model catalog probes under the corporate agent allowlist', () => {
  beforeEach(() => {
    mocks.getEnterprisePolicy.mockReset()
  })

  it('never starts codex when the policy does not allow it', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))
    const sessions = countingRunSession()

    await expect(codexProbe(sessions.runSession)('/homes/codex')).rejects.toThrow()
    expect(sessions.started()).toBe(0)
  })

  it('starts codex when no allowlist is set', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
    const sessions = countingRunSession()

    await expect(codexProbe(sessions.runSession)('/homes/codex')).rejects.toThrow(
      'listing stubbed out'
    )
    expect(sessions.started()).toBe(1)
  })

  it('never starts claude when the policy does not allow it', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['codex'] }))
    const discover = vi.fn<NonNullable<ClaudeProbeDeps['discover']>>()

    await expect(claudeProbe(discover)('/homes/claude')).rejects.toThrow()
    expect(discover).not.toHaveBeenCalled()
  })

  it('starts claude when the policy allows it', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))
    const discover = vi.fn<NonNullable<ClaudeProbeDeps['discover']>>(async () => ({
      success: false,
      error: 'listing stubbed out'
    }))

    await expect(claudeProbe(discover)('/homes/claude')).rejects.toThrow('listing stubbed out')
    expect(discover).toHaveBeenCalledTimes(1)
  })
})

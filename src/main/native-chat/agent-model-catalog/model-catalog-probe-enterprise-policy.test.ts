// Behavioural tests for the corporate `allowedAgents` gate on the session-less model catalog
// probes. They drive the real probe factories, because the probes reach the CLI through
// resolve*StructuredInvocation and never meet the per-record gate in the session launchers.
// Each refused case has an allowed twin so a gate that refuses everything still fails.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../../shared/enterprise-policy-fixture'
import { createClaudeModelCatalogProbe } from '../../claude/claude-model-catalog-probe'
import { createCodexModelCatalogProbe } from '../../codex/codex-model-catalog-probe'
import { acpLaunchSpecFor } from '../../acp/acp-launch-specs'
import { resolveAcpLaunchInvocation } from '../../acp/acp-structured-launch-resolution'
import { resolvePiRpcCommand } from '../../pi/rpc-launch-resolution'
import { registeredModelCatalogDiscovery } from '../../runtime/structured-agent-model-catalog-wiring'
import {
  STRUCTURED_AGENT_RUNTIME_REGISTRATIONS,
  type StructuredAgentModelCatalogContext
} from '../../runtime/structured-agent-runtime-registrations'
import type { resolveCliCommand } from '../../../shared/node-cli-command-resolution'

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

function claudeProbe(runListing: NonNullable<ClaudeProbeDeps['runListing']>) {
  return createClaudeModelCatalogProbe({
    resolveCommand: () => '/bin/claude',
    resolveInheritedEnv: async () => ({ PATH: '/bin', HOME: '/home/user' }),
    resolveAuthPolicy: () => ({ stripAuthEnv: false }),
    runListing
  })
}

const home = (path: string) => ({ variable: 'CODEX_HOME', path })

describe('model catalog probes under the corporate agent allowlist', () => {
  beforeEach(() => {
    mocks.getEnterprisePolicy.mockReset()
  })

  it('never starts codex when the policy does not allow it', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))
    const sessions = countingRunSession()

    await expect(codexProbe(sessions.runSession)(home('/homes/codex'))).rejects.toThrow()
    expect(sessions.started()).toBe(0)
  })

  it('starts codex when no allowlist is set', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
    const sessions = countingRunSession()

    await expect(codexProbe(sessions.runSession)(home('/homes/codex'))).rejects.toThrow(
      'listing stubbed out'
    )
    expect(sessions.started()).toBe(1)
  })

  it('never starts claude when the policy does not allow it', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['codex'] }))
    const runListing = vi.fn<NonNullable<ClaudeProbeDeps['runListing']>>()

    await expect(claudeProbe(runListing)(home('/homes/claude'))).rejects.toThrow()
    expect(runListing).not.toHaveBeenCalled()
  })

  it('starts claude when the policy allows it', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))
    const runListing = vi.fn<NonNullable<ClaudeProbeDeps['runListing']>>(async () => {
      throw new Error('listing stubbed out')
    })

    await expect(claudeProbe(runListing)(home('/homes/claude'))).rejects.toThrow(
      'listing stubbed out'
    )
    expect(runListing).toHaveBeenCalledTimes(1)
  })
})

function catalogContext(): StructuredAgentModelCatalogContext {
  const unused = async (): Promise<never> => {
    throw new Error('building a probe resolves nothing')
  }
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: building a probe only captures resolvers; none of these deps is read until a probe runs.
    deps: { stateDirectory: '/state' } as StructuredAgentModelCatalogContext['deps'],
    environment: {
      resolveBaseEnvironment: unused,
      resolveCodexEnvironment: unused,
      resolveClaudeInheritedEnv: unused
    }
  }
}

// v1.4.224 prewarms every registered probe at runtime start; pi and grok had no gate at all.
describe('the catalog probe roster under the corporate agent allowlist', () => {
  beforeEach(() => {
    mocks.getEnterprisePolicy.mockReset()
  })

  it('hands the catalog service no probe for an agent the policy does not allow', () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))

    const { probes } = registeredModelCatalogDiscovery(
      STRUCTURED_AGENT_RUNTIME_REGISTRATIONS,
      catalogContext()
    )

    expect(Object.keys(probes)).toEqual(['claude'])
  })

  it('keeps every listing agent when no allowlist is set', () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())

    const { probes } = registeredModelCatalogDiscovery(
      STRUCTURED_AGENT_RUNTIME_REGISTRATIONS,
      catalogContext()
    )

    expect(Object.keys(probes)).toEqual(expect.arrayContaining(['claude', 'codex', 'pi', 'grok']))
  })

  it('refuses an ACP invocation before resolving any environment', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))
    const resolveEnvironment = vi.fn(async () => ({ PATH: '/bin' }))

    await expect(
      resolveAcpLaunchInvocation(acpLaunchSpecFor('grok')!, home('/homes/grok'), {
        resolveEnvironment
      })
    ).rejects.toThrow('agent_blocked_by_enterprise_policy')
    expect(resolveEnvironment).not.toHaveBeenCalled()
  })

  it('resolves an ACP invocation the policy allows', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['grok'] }))
    const resolveEnvironment = vi.fn(async (): Promise<Record<string, string>> => {
      throw new Error('environment stubbed out')
    })

    await expect(
      resolveAcpLaunchInvocation(acpLaunchSpecFor('grok')!, home('/homes/grok'), {
        resolveEnvironment
      })
    ).rejects.toThrow('environment stubbed out')
    expect(resolveEnvironment).toHaveBeenCalledTimes(1)
  })

  it('refuses to resolve the pi binary when the policy does not allow pi', () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))
    const resolve = vi.fn<typeof resolveCliCommand>(() => '/bin/pi')

    expect(() => resolvePiRpcCommand({ PATH: '/bin' }, {}, resolve)).toThrow(
      'agent_blocked_by_enterprise_policy'
    )
    expect(resolve).not.toHaveBeenCalled()
  })

  it('resolves the pi binary when the policy allows pi', () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['pi'] }))
    const resolve = vi.fn<typeof resolveCliCommand>(() => '/bin/pi')

    expect(resolvePiRpcCommand({ PATH: '/bin' }, {}, resolve)).toBe('/bin/pi')
    expect(resolve).toHaveBeenCalled()
  })
})

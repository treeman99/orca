// Fork-owned: a policy without opencode must not spawn it even to probe a model launch. v1.4.223's
// model preflight runs before the orchestration and terminal allowlist refusals.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { resolveAgentStartupPlanInputs } from '../../shared/agent-startup-plan-inputs'
import type * as EnterprisePolicyFileModule from '../enterprise/enterprise-policy-file'

const mocks = vi.hoisted(() => ({ getEnterprisePolicy: vi.fn() }))

vi.mock('../enterprise/enterprise-policy-file', async (importOriginal) => ({
  ...(await importOriginal<typeof EnterprisePolicyFileModule>()),
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))
vi.mock('../managed-data-accounts/launch-environment', () => ({
  applyManagedDataAccountEnvironment: vi.fn()
}))
vi.mock('./opencode-launch-capabilities', () => ({ probeOpenCodeLaunchCapabilities: vi.fn() }))
vi.mock('./opencode-model-availability', () => ({
  resolveOpenCodeDirectModelExecutable: vi.fn(),
  probeOpenCodeModelAvailability: vi.fn()
}))
vi.mock('./opencode-launch-model-context', () => ({ probeOpenCodeLaunchModelContext: vi.fn() }))

import { resolveOpenCodeDirectModelExecutable } from './opencode-model-availability'
import { prepareOpenCodeModelStartupInputs } from './opencode-model-startup-plan'

function scope() {
  return {
    inputs: resolveAgentStartupPlanInputs({
      agent: 'opencode',
      settings: { agentCmdOverrides: {}, agentDefaultEnv: {} },
      platform: process.platform,
      isRemote: false,
      sessionOptions: { model: 'opencode/fledge-alpha-free' }
    }),
    cwd: '/private/project',
    hostIdentity: 'host'
  }
}

describe('OpenCode model startup enterprise policy', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resolveOpenCodeDirectModelExecutable).mockResolvedValue(null)
  })

  it('spawns no opencode probe when the policy does not list opencode', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))
    const input = scope()

    await expect(prepareOpenCodeModelStartupInputs(input)).resolves.toEqual({
      inputs: input.inputs
    })
    expect(resolveOpenCodeDirectModelExecutable).not.toHaveBeenCalled()
  })

  it('probes as upstream does on a build with no policy file', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy({ allowedAgents: null }))

    await expect(prepareOpenCodeModelStartupInputs(scope())).rejects.toThrow(
      'cannot verify this OpenCode model launch'
    )
    expect(resolveOpenCodeDirectModelExecutable).toHaveBeenCalledTimes(1)
  })
})

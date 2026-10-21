// Fork-owned: v1.4.232 exported observeStructuredAgentLaunch for the host's agent availability
// snapshot, which runs every registered agent's `<cmd> --version` at startup, on settings changes
// and on Refresh. The ACP agents' launch resolver there is not the gated one, so an agent outside
// `allowedAgents` (opencode2, omp, ...) was spawned and published as available.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  observeAgentCliVersion: vi.fn(),
  resolveLaunch: vi.fn()
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))
vi.mock('../agent-cli-version-probe', () => ({
  observeAgentCliVersion: mocks.observeAgentCliVersion
}))
vi.mock('./structured-agent-shell-environment', () => ({
  resolveHostAgentBaseEnvironment: async () => ({}),
  refreshHostAgentBaseEnvironmentAfterMiss: async () => ({})
}))
vi.mock('./structured-agent-runtime-metadata', () => ({
  structuredAgentRuntimeMetadata: () => ({
    launchCheck: { resolveLaunch: mocks.resolveLaunch, supportsVersion: () => true }
  })
}))

import { observeStructuredAgentLaunch } from './structured-agent-launch-support'

const runtime = { requireStore: () => ({ getSettings: () => ({}) }) }
const home = async () => '/home/user'

beforeEach(() => {
  mocks.getEnterprisePolicy.mockReset()
  mocks.observeAgentCliVersion.mockReset().mockResolvedValue('supported')
  mocks.resolveLaunch.mockReset().mockResolvedValue({ command: '/usr/bin/opencode2', env: {} })
})

describe('agent launch observation under the enterprise policy', () => {
  it('never probes an agent the policy does not list, and reads it as unsupported', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))

    await expect(observeStructuredAgentLaunch('opencode2', home, runtime, false)).resolves.toBe(
      'unsupported'
    )
    expect(mocks.resolveLaunch).not.toHaveBeenCalled()
    expect(mocks.observeAgentCliVersion).not.toHaveBeenCalled()
  })

  it('probes an allowed agent as upstream does', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy({ allowedAgents: null }))

    await expect(observeStructuredAgentLaunch('opencode2', home, runtime, false)).resolves.toBe(
      'supported'
    )
    expect(mocks.observeAgentCliVersion).toHaveBeenCalledTimes(1)
  })
})

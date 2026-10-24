// Fork-owned: the host's agent availability snapshot is what a client reads to offer chats; an
// agent outside `allowedAgents` must be published as refused and never get its `--version` run.
import { beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../shared/constants'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  observe: vi.fn(async (_agent: string) => ({ status: 'ready', version: '2.0.14' }))
}))
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))
vi.mock('../preflight/workspace-agent-detection', () => ({ onAgentsRefreshedOnHost: () => {} }))
vi.mock('./structured-agent-launch-support', () => ({
  observeStructuredAgentLaunch: mocks.observe
}))
vi.mock('./structured-agent-shell-environment', () => ({
  recaptureHostShellEnvironment: async () => {}
}))
vi.mock('./structured-agent-runtime-metadata', () => ({
  STRUCTURED_AGENT_RUNTIME_METADATA: ['claude', 'opencode2'].map((agent) => ({
    definition: { agent },
    supportsLocation: () => true
  }))
}))

import { installStructuredAgentAvailability } from './structured-agent-availability'

beforeEach(() => {
  mocks.observe.mockClear()
})

async function snapshot() {
  const availability = installStructuredAgentAvailability(null, {
    requireStore: () => ({ getSettings: () => getDefaultSettings('/home/test') })
  })
  const read = vi.fn()
  availability.subscribe(read)
  await vi.waitFor(() => expect(read).toHaveBeenCalled())
  return read.mock.calls[0][0]
}

it('refuses an agent outside the allowlist without probing it', async () => {
  mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))

  expect(await snapshot()).toEqual([
    { agent: 'claude', state: 'available' },
    { agent: 'opencode2', state: 'refused', reason: 'agent' }
  ])
  expect(mocks.observe.mock.calls.map(([agent]) => agent)).toEqual(['claude'])
})

it('probes every agent when no allowlist is set', async () => {
  mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy({ allowedAgents: null }))

  expect(await snapshot()).toEqual([
    { agent: 'claude', state: 'available' },
    { agent: 'opencode2', state: 'available' }
  ])
})

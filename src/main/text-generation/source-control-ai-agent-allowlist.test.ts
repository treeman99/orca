// Behavioural tests for `allowedAgents` on the Source Control AI text lane.
//
// Commit messages, PR fields, branch and workspace names, chat names (fired by a chat's first
// prompt) and Jira titles all spawn the agent picked under Settings → Git → Source Control AI
// through `runGenerationRequest`; the settings row's model list spawns it through
// `discoverModelsLocal`. Until v1.4.237 only the runtime RPC and Jira entries checked the
// allowlist, so the desktop IPC and automatic chat naming ran whatever was configured — a custom
// command line included. Each refusal has an upstream-build twin that must still spawn.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import type { ResolvedSourceControlAiGenerationParams } from '../../shared/source-control-ai'
import type * as EnterprisePolicyFileModule from '../enterprise/enterprise-policy-file'
import { discoverModelsLocal } from './commit-message-model-discovery'
import { generateConversationName } from './conversation-name-generation-request'
import type {
  CommitMessageGenerationTarget,
  SpawnSourceControlAgent
} from './source-control-text-generation-types'

const mocks = vi.hoisted(() => ({ getEnterprisePolicy: vi.fn() }))

vi.mock('../enterprise/enterprise-policy-file', async (importOriginal) => ({
  ...(await importOriginal<typeof EnterprisePolicyFileModule>()),
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

const BLOCKED = expect.stringMatching(/not permitted by your organization's Orca policy/)
const LOCAL: CommitMessageGenerationTarget = { kind: 'local', cwd: '/repo' }
const CODEX = { agentId: 'codex', model: 'gpt-5.5' } as const
const CUSTOM = { agentId: 'custom', model: '', customAgentCommand: 'agent' } as const

function allowOnly(...agents: string[]): void {
  mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: agents }))
}

function upstreamBuild(): void {
  mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy({ allowedAgents: null }))
}

// Reaching the spawn is the proof the gate let it through; the lane reports the throw as a failure.
function spawnProbe() {
  return vi.fn<SpawnSourceControlAgent>(() => {
    throw new Error('spawn reached')
  })
}

function nameChat(
  params: ResolvedSourceControlAiGenerationParams,
  spawnAgent: SpawnSourceControlAgent,
  target: CommitMessageGenerationTarget = LOCAL
): ReturnType<typeof generateConversationName> {
  return generateConversationName({
    context: { firstPrompt: 'Fix login' },
    params,
    target,
    spawnAgent
  })
}

function discoverCodexModels(spawnAgent: SpawnSourceControlAgent) {
  return discoverModelsLocal({
    agentId: 'codex',
    env: {},
    options: {},
    backslash: 'escape',
    spawnAgent
  })
}

beforeEach(() => {
  mocks.getEnterprisePolicy.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('Source Control AI text generation under allowedAgents', () => {
  it.each([
    ['a CLI the policy does not list', CODEX],
    ['a custom command line', CUSTOM]
  ])('refuses %s before anything is spawned', async (_name, params) => {
    allowOnly('claude', 'opencode')
    const spawnAgent = spawnProbe()

    await expect(nameChat(params, spawnAgent)).resolves.toEqual({ success: false, error: BLOCKED })
    expect(spawnAgent).not.toHaveBeenCalled()
  })

  it('refuses on a remote host too', async () => {
    allowOnly('claude', 'opencode')
    const execute = vi.fn()

    await expect(
      nameChat(CODEX, spawnProbe(), {
        kind: 'remote',
        cwd: '/repo',
        missingBinaryLocation: 'remote PATH',
        execute
      })
    ).resolves.toEqual({ success: false, error: BLOCKED })
    expect(execute).not.toHaveBeenCalled()
  })

  it('spawns a CLI the policy lists', async () => {
    allowOnly('claude', 'opencode')
    const spawnAgent = spawnProbe()

    await nameChat({ agentId: 'claude', model: 'sonnet' }, spawnAgent)
    expect(spawnAgent).toHaveBeenCalled()
  })

  it('runs a custom command once the administrator lists "custom"', async () => {
    allowOnly('claude', 'custom')
    const spawnAgent = spawnProbe()

    await nameChat(CUSTOM, spawnAgent)
    expect(spawnAgent).toHaveBeenCalled()
  })

  it('spawns any agent on an upstream build with no policy file', async () => {
    upstreamBuild()
    const spawnAgent = spawnProbe()

    await nameChat(CODEX, spawnAgent)
    expect(spawnAgent).toHaveBeenCalled()
  })
})

describe('Source Control AI model discovery under allowedAgents', () => {
  it('does not run a blocked CLI to list its models', async () => {
    allowOnly('claude', 'opencode')
    const spawnAgent = spawnProbe()

    await expect(discoverCodexModels(spawnAgent)).resolves.toEqual({
      success: false,
      error: BLOCKED
    })
    expect(spawnAgent).not.toHaveBeenCalled()
  })

  it('runs it on an upstream build with no policy file', async () => {
    upstreamBuild()
    const spawnAgent = spawnProbe()

    await discoverCodexModels(spawnAgent)
    expect(spawnAgent).toHaveBeenCalled()
  })
})

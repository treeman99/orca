// Fork-owned: v1.4.226 added Jira title generation, which spawns the Source Control AI agent's CLI
// with the Jira draft as its prompt — a launch the corporate agent allowlist has to refuse.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { getDefaultSettings } from '../../shared/constants'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  prepare: vi.fn(),
  generate: vi.fn(),
  resolve: vi.fn()
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))
vi.mock('../jira/client', () => ({ getStatus: () => ({ sites: [{ id: 'site-1' }] }) }))
vi.mock('./commit-message-agent-environment', () => ({
  prepareLocalCommitMessageAgentEnv: mocks.prepare
}))
vi.mock('./commit-message-text-generation', () => ({ resolveTextGenerationParams: mocks.resolve }))
vi.mock('./jira-issue-summary-text-generation', () => ({
  generateJiraIssueSummaryFromContext: mocks.generate,
  cancelGenerateJiraIssueSummaryLocal: vi.fn()
}))

const { generateJiraIssueSummaryRequest } = await import('./jira-issue-summary-requests')

const args = { description: 'Draft', siteId: 'site-1', requestId: 'req-1', draftId: 'draft-1' }
const host = {
  getSettings: () => getDefaultSettings('/fixture'),
  getAgentEnvironment: () => ({ prepareForCodexLaunch: () => 'host-codex-home' })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockReturnValue({ ok: true, params: { agentId: 'codex', model: '' } })
  mocks.prepare.mockResolvedValue({ ok: true })
  mocks.generate.mockResolvedValue({ success: true, summary: 'Generated title' })
})

describe('Jira title generation under the corporate agent allowlist', () => {
  it('never spawns an agent the policy does not allow', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy({ allowedAgents: ['claude'] }))

    expect(await generateJiraIssueSummaryRequest(host, 'owner-1', args)).toMatchObject({
      success: false,
      error: expect.stringContaining('not permitted')
    })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('generates with an agent the policy allows', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())

    expect(await generateJiraIssueSummaryRequest(host, 'owner-1', args)).toMatchObject({
      success: true
    })
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })
})

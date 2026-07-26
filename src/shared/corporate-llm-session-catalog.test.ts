import { afterEach, describe, expect, it } from 'vitest'
import { getAgentSessionOptionCatalog } from './agent-session-option-catalog'
import { resolveAgentSessionOptionLaunch } from './agent-session-option-launch'
import { CORPORATE_LLM_ENDPOINT_ENV } from './corporate-llm-launch-env'
import {
  clearCorporateLlmEndpointsForTests,
  corporateLlmModelId,
  corporateLlmEndpointIdFromModelId,
  registerCorporateLlmEndpoints
} from './corporate-llm-session-catalog'
import { buildAgentDraftLaunchPlan, buildAgentStartupPlan } from './tui-agent-startup'

const ENDPOINT = { id: 'inhouse-qwen', label: '사내 LLM (Qwen3-Coder)' }
const MODEL_ID = corporateLlmModelId(ENDPOINT.id)

const startupArgs = {
  agent: 'claude' as const,
  prompt: 'ship it',
  cmdOverrides: {},
  platform: 'win32' as NodeJS.Platform
}

describe('corporate LLM endpoints in the session-option catalog', () => {
  afterEach(() => clearCorporateLlmEndpointsForTests())

  it('leaves every agent catalog untouched when the policy provisions none', () => {
    const before = getAgentSessionOptionCatalog('claude')
    registerCorporateLlmEndpoints([])
    expect(getAgentSessionOptionCatalog('claude')).toBe(before)
    expect(getAgentSessionOptionCatalog('claude')?.models.map((model) => model.id)).toEqual([
      'fable',
      'opus',
      'sonnet',
      'haiku'
    ])
  })

  it('offers a provisioned endpoint as a model and keeps the object identity stable', () => {
    registerCorporateLlmEndpoints([{ ...ENDPOINT, description: '다음 세션부터 적용' }])
    const catalog = getAgentSessionOptionCatalog('claude')
    expect(catalog).toBe(getAgentSessionOptionCatalog('claude'))
    expect(catalog?.models.at(-1)).toMatchObject({
      id: MODEL_ID,
      label: '사내 LLM (Qwen3-Coder)',
      description: '다음 세션부터 적용',
      options: []
    })
  })

  it('round-trips the endpoint id through the model id', () => {
    expect(corporateLlmEndpointIdFromModelId(MODEL_ID)).toBe(ENDPOINT.id)
    expect(corporateLlmEndpointIdFromModelId('sonnet')).toBeNull()
  })

  it('never turns a de-provisioned endpoint into a model flag the CLI cannot resolve', () => {
    // Nothing registered: main reports an unknown endpoint and keeps the backend
    // the launch already had, which a bogus `--model` flag would have broken.
    expect(resolveAgentSessionOptionLaunch('claude', { model: MODEL_ID })).toEqual({
      args: [],
      env: { [CORPORATE_LLM_ENDPOINT_ENV]: ENDPOINT.id },
      appliedValues: { model: MODEL_ID }
    })
  })

  it('resolves the selection to the endpoint env instead of a --model flag', () => {
    registerCorporateLlmEndpoints([ENDPOINT])
    expect(resolveAgentSessionOptionLaunch('claude', { model: MODEL_ID })).toEqual({
      args: [],
      env: { [CORPORATE_LLM_ENDPOINT_ENV]: ENDPOINT.id },
      appliedValues: { model: MODEL_ID }
    })
  })

  it('emits no env for an ordinary model', () => {
    registerCorporateLlmEndpoints([ENDPOINT])
    expect(resolveAgentSessionOptionLaunch('claude', { model: 'sonnet', effort: 'high' })).toEqual({
      args: ['--model', 'sonnet', '--effort', 'high'],
      appliedValues: { model: 'sonnet', effort: 'high' }
    })
  })

  it('reaches the launch env and the resume config when the endpoint is chosen', () => {
    registerCorporateLlmEndpoints([ENDPOINT])
    const plan = buildAgentStartupPlan({ ...startupArgs, sessionOptions: { model: MODEL_ID } })

    expect(plan?.env).toEqual({ [CORPORATE_LLM_ENDPOINT_ENV]: ENDPOINT.id })
    // The selection is the only thing persisted; the token stays in main.
    expect(plan?.launchConfig.agentEnv).toEqual({ [CORPORATE_LLM_ENDPOINT_ENV]: ENDPOINT.id })
    expect(plan?.launchCommand).not.toContain('--model')
    expect(plan?.sessionOptions).toEqual({ model: MODEL_ID })
  })

  it('merges the selection over the agent default env without dropping it', () => {
    registerCorporateLlmEndpoints([ENDPOINT])
    const plan = buildAgentStartupPlan({
      ...startupArgs,
      agentEnv: { CLAUDE_CODE_USE_BEDROCK: '1', [CORPORATE_LLM_ENDPOINT_ENV]: 'stale' },
      sessionOptions: { model: MODEL_ID }
    })

    expect(plan?.env).toEqual({
      CLAUDE_CODE_USE_BEDROCK: '1',
      [CORPORATE_LLM_ENDPOINT_ENV]: ENDPOINT.id
    })
  })

  it('carries the selection on a draft launch too', () => {
    registerCorporateLlmEndpoints([ENDPOINT])
    const plan = buildAgentDraftLaunchPlan({
      agent: 'claude',
      draft: 'ship it',
      cmdOverrides: {},
      platform: 'win32',
      sessionOptions: { model: MODEL_ID }
    })

    expect(plan?.env).toMatchObject({ [CORPORATE_LLM_ENDPOINT_ENV]: ENDPOINT.id })
  })

  it('changes nothing about a launch that did not choose an endpoint', () => {
    const baseline = buildAgentStartupPlan({
      ...startupArgs,
      agentEnv: { CLAUDE_CODE_USE_BEDROCK: '1' },
      sessionOptions: { model: 'sonnet' }
    })
    registerCorporateLlmEndpoints([ENDPOINT])
    const withEndpointProvisioned = buildAgentStartupPlan({
      ...startupArgs,
      agentEnv: { CLAUDE_CODE_USE_BEDROCK: '1' },
      sessionOptions: { model: 'sonnet' }
    })

    expect(withEndpointProvisioned).toEqual(baseline)
    expect(withEndpointProvisioned?.env).toEqual({ CLAUDE_CODE_USE_BEDROCK: '1' })
    expect(withEndpointProvisioned?.launchCommand).toContain("'--model' 'sonnet'")
  })

  it('keeps the endpoint when free-form args name a model, since a flag is not a backend', () => {
    registerCorporateLlmEndpoints([ENDPOINT])
    expect(
      resolveAgentSessionOptionLaunch('claude', { model: MODEL_ID }, ['--model', 'opus'])
    ).toEqual({
      args: [],
      env: { [CORPORATE_LLM_ENDPOINT_ENV]: ENDPOINT.id },
      appliedValues: { model: MODEL_ID }
    })
  })
})

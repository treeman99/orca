import { describe, expect, it } from 'vitest'
import { corporateLlmLaunchEnv } from './corporate-llm-launch-env'
import type { EnterpriseLlmEndpoint } from './enterprise-llm-endpoints'

function endpoint(overrides: Partial<EnterpriseLlmEndpoint> = {}): EnterpriseLlmEndpoint {
  return {
    id: 'ds-llm',
    label: '사내 LLM',
    baseUrl: 'https://llm.samsungds.net/v1',
    api: 'openai',
    model: null,
    ...overrides
  }
}

describe('corporateLlmLaunchEnv', () => {
  it('writes OpenAI-protocol variables', () => {
    const env = corporateLlmLaunchEnv({ endpoint: endpoint(), token: 'sk-corp' })
    expect(env.OPENAI_BASE_URL).toBe('https://llm.samsungds.net/v1')
    expect(env.OPENAI_API_KEY).toBe('sk-corp')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
  })

  it('writes Anthropic-protocol variables', () => {
    const env = corporateLlmLaunchEnv({
      endpoint: endpoint({ api: 'anthropic' }),
      token: 'corp-token'
    })
    expect(env.ANTHROPIC_BASE_URL).toBe('https://llm.samsungds.net/v1')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('corp-token')
    expect(env.OPENAI_API_KEY).toBeUndefined()
  })

  it('passes the model through under the right name for each protocol', () => {
    expect(
      corporateLlmLaunchEnv({ endpoint: endpoint({ model: 'qwen3' }), token: 't' }).OPENAI_MODEL
    ).toBe('qwen3')
    expect(
      corporateLlmLaunchEnv({
        endpoint: endpoint({ api: 'anthropic', model: 'qwen3' }),
        token: 't'
      }).ANTHROPIC_MODEL
    ).toBe('qwen3')
  })

  it('omits the model variable when the endpoint does not pin one', () => {
    const env = corporateLlmLaunchEnv({ endpoint: endpoint(), token: 't' })
    expect(env.OPENAI_MODEL).toBeUndefined()
  })

  // An in-house endpoint sits inside the corporate network; routing it through
  // the external proxy either fails or exposes prompt traffic.
  it('adds the endpoint host to NO_PROXY', () => {
    const env = corporateLlmLaunchEnv({ endpoint: endpoint(), token: 't' })
    expect(env.NO_PROXY).toBe('llm.samsungds.net')
    expect(env.no_proxy).toBe('llm.samsungds.net')
  })

  it('merges into an inherited NO_PROXY instead of replacing it', () => {
    const env = corporateLlmLaunchEnv({
      endpoint: endpoint(),
      token: 't',
      baseEnv: { NO_PROXY: 'github.samsungds.net,.corp.net' }
    })
    expect(env.NO_PROXY).toBe('github.samsungds.net,.corp.net,llm.samsungds.net')
  })

  it('does not duplicate a host the inherited list already exempts', () => {
    const env = corporateLlmLaunchEnv({
      endpoint: endpoint(),
      token: 't',
      baseEnv: { no_proxy: 'LLM.samsungds.net' }
    })
    expect(env.NO_PROXY).toBe('LLM.samsungds.net')
  })
})

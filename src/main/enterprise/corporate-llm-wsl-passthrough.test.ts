import { describe, expect, it } from 'vitest'
import { corporateLlmWslenvEntries } from './corporate-llm-wsl-passthrough'

describe('corporateLlmWslenvEntries', () => {
  it('lists nothing when none of the variables are set', () => {
    expect(corporateLlmWslenvEntries({})).toEqual([])
  })

  // wsl.exe imports only what WSLENV names, so a missing entry means the guest
  // silently keeps talking to the previous backend.
  it('crosses the resolved OpenAI-protocol variables untranslated', () => {
    expect(
      corporateLlmWslenvEntries({
        OPENAI_BASE_URL: 'https://llm.samsungds.net/v1',
        OPENAI_API_KEY: 'sk-corp',
        OPENAI_MODEL: 'qwen3-coder'
      })
    ).toEqual(['OPENAI_BASE_URL/u', 'OPENAI_API_KEY/u', 'OPENAI_MODEL/u'])
  })

  it('crosses the resolved Anthropic-protocol variables untranslated', () => {
    expect(
      corporateLlmWslenvEntries({
        ANTHROPIC_BASE_URL: 'https://llm.samsungds.net',
        ANTHROPIC_AUTH_TOKEN: 'corp-token'
      })
    ).toEqual(['ANTHROPIC_BASE_URL/u', 'ANTHROPIC_AUTH_TOKEN/u'])
  })

  it('crosses the proxy exemption so in-house traffic skips the external proxy', () => {
    expect(corporateLlmWslenvEntries({ NO_PROXY: 'llm.samsungds.net' })).toEqual(['NO_PROXY/u'])
  })

  it('crosses the endpoint selector so the backend is checkable from inside WSL', () => {
    expect(corporateLlmWslenvEntries({ ORCA_CORPORATE_LLM_ENDPOINT: 'ds-llm' })).toEqual([
      'ORCA_CORPORATE_LLM_ENDPOINT/u'
    ])
  })

  it('path-translates a Windows certificate bundle', () => {
    expect(
      corporateLlmWslenvEntries({ NODE_EXTRA_CA_CERTS: 'C:\\certs\\corp-root-ca.pem' })
    ).toEqual(['NODE_EXTRA_CA_CERTS/p'])
  })

  it('leaves a bundle the user already expressed as a Linux path untranslated', () => {
    expect(corporateLlmWslenvEntries({ NODE_EXTRA_CA_CERTS: '/etc/ssl/corp-root-ca.pem' })).toEqual(
      ['NODE_EXTRA_CA_CERTS/u']
    )
  })

  it('skips a variable that is set but empty', () => {
    expect(corporateLlmWslenvEntries({ OPENAI_API_KEY: '', NODE_EXTRA_CA_CERTS: '' })).toEqual([])
  })
})

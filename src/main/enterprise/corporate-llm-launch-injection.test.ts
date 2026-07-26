import { describe, expect, it, vi } from 'vitest'
import {
  applyCorporateLlmSelection,
  CORPORATE_LLM_ENDPOINT_ENV,
  describeCorporateLlmSelection
} from './corporate-llm-launch-injection'
import type { EnterpriseLlmEndpoint } from '../../shared/enterprise-llm-endpoints'

const ENDPOINT: EnterpriseLlmEndpoint = {
  id: 'ds-llm',
  label: '사내 LLM',
  baseUrl: 'https://llm.samsungds.net/v1',
  api: 'openai',
  model: 'qwen3-coder'
}

function deps(token: string | null, endpoints: EnterpriseLlmEndpoint[] = [ENDPOINT]) {
  return { endpoints, readToken: vi.fn(() => token) }
}

describe('applyCorporateLlmSelection', () => {
  it('does nothing when no endpoint is selected', () => {
    const env: Record<string, string> = { PATH: '/usr/bin' }
    expect(applyCorporateLlmSelection(env, deps('t'))).toEqual({ kind: 'none' })
    expect(env).toEqual({ PATH: '/usr/bin' })
  })

  it('injects the endpoint variables and the token', () => {
    const env: Record<string, string> = { [CORPORATE_LLM_ENDPOINT_ENV]: 'ds-llm' }
    const result = applyCorporateLlmSelection(env, deps('sk-corp'))
    expect(result).toEqual({ kind: 'applied', endpoint: ENDPOINT })
    expect(env.OPENAI_BASE_URL).toBe('https://llm.samsungds.net/v1')
    expect(env.OPENAI_API_KEY).toBe('sk-corp')
    expect(env.OPENAI_MODEL).toBe('qwen3-coder')
    expect(env.NO_PROXY).toBe('llm.samsungds.net')
  })

  it('reads the token by endpoint id, never from the environment', () => {
    const dependencies = deps('sk-corp')
    applyCorporateLlmSelection({ [CORPORATE_LLM_ENDPOINT_ENV]: 'ds-llm' }, dependencies)
    expect(dependencies.readToken).toHaveBeenCalledWith('ds-llm')
  })

  // The selector rides in persisted launch config; a stale id must not silently
  // send an unauthenticated request or fail the spawn.
  it('leaves the environment untouched for an endpoint the policy does not define', () => {
    const env: Record<string, string> = { [CORPORATE_LLM_ENDPOINT_ENV]: 'gone' }
    expect(applyCorporateLlmSelection(env, deps('sk-corp'))).toEqual({
      kind: 'unknown-endpoint',
      id: 'gone'
    })
    expect(env.OPENAI_BASE_URL).toBeUndefined()
    expect(env.OPENAI_API_KEY).toBeUndefined()
  })

  it('leaves the environment untouched when the user has saved no token', () => {
    const env: Record<string, string> = { [CORPORATE_LLM_ENDPOINT_ENV]: 'ds-llm' }
    expect(applyCorporateLlmSelection(env, deps(null))).toEqual({
      kind: 'missing-token',
      endpoint: ENDPOINT
    })
    expect(env.OPENAI_BASE_URL).toBeUndefined()
  })

  it('merges the endpoint host into a NO_PROXY the proxy layer already wrote', () => {
    const env: Record<string, string> = {
      [CORPORATE_LLM_ENDPOINT_ENV]: 'ds-llm',
      NO_PROXY: 'github.samsungds.net'
    }
    applyCorporateLlmSelection(env, deps('sk-corp'))
    expect(env.NO_PROXY).toBe('github.samsungds.net,llm.samsungds.net')
  })
})

describe('describeCorporateLlmSelection', () => {
  it('never includes the token', () => {
    const env: Record<string, string> = { [CORPORATE_LLM_ENDPOINT_ENV]: 'ds-llm' }
    const message = describeCorporateLlmSelection(
      applyCorporateLlmSelection(env, deps('sk-secret'))
    )
    expect(message).toContain('ds-llm')
    expect(message).not.toContain('sk-secret')
  })

  it('says nothing when nothing was selected', () => {
    expect(describeCorporateLlmSelection({ kind: 'none' })).toBeNull()
  })
})

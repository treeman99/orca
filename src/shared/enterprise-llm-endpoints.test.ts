import { describe, expect, it } from 'vitest'
import {
  enterpriseLlmEndpointHost,
  resolveEnterpriseLlmEndpoints,
  validateUserLlmEndpointInput
} from './enterprise-llm-endpoints'

function parse(raw: unknown): {
  endpoints: ReturnType<typeof resolveEnterpriseLlmEndpoints>
  warnings: string[]
} {
  const warnings: string[] = []
  return { endpoints: resolveEnterpriseLlmEndpoints(raw, warnings), warnings }
}

describe('resolveEnterpriseLlmEndpoints', () => {
  it('returns nothing when the key is absent', () => {
    const { endpoints, warnings } = parse(undefined)
    expect(endpoints).toEqual([])
    expect(warnings).toEqual([])
  })

  it('reads a complete entry', () => {
    const { endpoints, warnings } = parse([
      {
        id: 'ds-llm',
        label: '사내 LLM',
        baseUrl: 'https://llm.samsungds.net/v1',
        api: 'openai',
        model: 'qwen3-coder'
      }
    ])
    expect(warnings).toEqual([])
    expect(endpoints).toEqual([
      {
        id: 'ds-llm',
        label: '사내 LLM',
        baseUrl: 'https://llm.samsungds.net/v1',
        api: 'openai',
        model: 'qwen3-coder'
      }
    ])
  })

  it('defaults label to the id, api to openai, and model to null', () => {
    const { endpoints } = parse([{ id: 'ds', baseUrl: 'https://llm.samsungds.net' }])
    expect(endpoints[0]).toMatchObject({ label: 'ds', api: 'openai', model: null })
  })

  it('strips a trailing slash so callers can concatenate paths', () => {
    const { endpoints } = parse([{ id: 'ds', baseUrl: 'https://llm.samsungds.net/v1/' }])
    expect(endpoints[0]?.baseUrl).toBe('https://llm.samsungds.net/v1')
  })

  // The token is sent to whatever this URL says, so a plain-http typo would put
  // it on the wire in the clear.
  it('refuses a non-https endpoint unless it is loopback', () => {
    const { endpoints, warnings } = parse([{ id: 'ds', baseUrl: 'http://llm.samsungds.net' }])
    expect(endpoints).toEqual([])
    expect(warnings[0]).toContain('https')
  })

  it('allows http on loopback for a local test server', () => {
    for (const baseUrl of ['http://localhost:8080/v1', 'http://127.0.0.1:8080']) {
      expect(parse([{ id: 'local', baseUrl }]).endpoints).toHaveLength(1)
    }
  })

  it('drops an entry with an unusable url, id, or api but keeps the others', () => {
    const { endpoints, warnings } = parse([
      { id: 'good', baseUrl: 'https://a.corp.net' },
      { id: 'bad-url', baseUrl: 'not a url' },
      { baseUrl: 'https://b.corp.net' },
      { id: 'bad-api', baseUrl: 'https://c.corp.net', api: 'grpc' },
      'nonsense'
    ])
    expect(endpoints.map((endpoint) => endpoint.id)).toEqual(['good'])
    expect(warnings).toHaveLength(4)
  })

  it('keeps the first of a duplicated id and warns', () => {
    const { endpoints, warnings } = parse([
      { id: 'ds', baseUrl: 'https://first.corp.net' },
      { id: 'ds', baseUrl: 'https://second.corp.net' }
    ])
    expect(endpoints).toHaveLength(1)
    expect(endpoints[0]?.baseUrl).toBe('https://first.corp.net')
    expect(warnings[0]).toContain('twice')
  })

  it('warns when the value is not an array', () => {
    const { endpoints, warnings } = parse({ id: 'ds' })
    expect(endpoints).toEqual([])
    expect(warnings[0]).toContain('must be an array')
  })
})

describe('enterpriseLlmEndpointHost', () => {
  it('extracts a lowercase hostname without the port', () => {
    const { endpoints } = parse([{ id: 'ds', baseUrl: 'https://LLM.samsungds.net:8443/v1' }])
    expect(enterpriseLlmEndpointHost(endpoints[0]!)).toBe('llm.samsungds.net')
  })
})

describe('validateUserLlmEndpointInput', () => {
  it('accepts an https endpoint and normalizes it', () => {
    const result = validateUserLlmEndpointInput({
      label: '  Company LLM ',
      baseUrl: 'https://llm.mine/v1/',
      api: 'openai',
      model: ' qwen '
    })
    expect(result).toEqual({
      ok: true,
      value: { label: 'Company LLM', baseUrl: 'https://llm.mine/v1', api: 'openai', model: 'qwen' }
    })
  })

  it('defaults the label to the URL and the protocol to openai', () => {
    const result = validateUserLlmEndpointInput({ baseUrl: 'https://llm.mine/v1' })
    expect(result).toMatchObject({
      ok: true,
      value: { label: 'https://llm.mine/v1', api: 'openai' }
    })
  })

  // Why: the token is sent to this URL, so http would leak it in clear text.
  it('rejects a non-https URL', () => {
    const result = validateUserLlmEndpointInput({ baseUrl: 'http://insecure/v1' })
    expect(result.ok).toBe(false)
  })

  it('rejects an unknown protocol', () => {
    const result = validateUserLlmEndpointInput({ baseUrl: 'https://llm.mine', api: 'gemini' })
    expect(result.ok).toBe(false)
  })

  it('rejects a missing URL', () => {
    expect(validateUserLlmEndpointInput({}).ok).toBe(false)
  })
})

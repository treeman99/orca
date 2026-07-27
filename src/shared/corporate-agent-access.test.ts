import { describe, expect, it } from 'vitest'
import { filterAgentsByPolicy, isAgentAllowedByPolicy } from './corporate-agent-access'

describe('isAgentAllowedByPolicy', () => {
  it('allows every agent when the allowlist is null (no restriction)', () => {
    expect(isAgentAllowedByPolicy('codex', null)).toBe(true)
    expect(isAgentAllowedByPolicy('claude', undefined)).toBe(true)
  })

  it('allows only listed agents when an allowlist is present', () => {
    expect(isAgentAllowedByPolicy('claude', ['claude'])).toBe(true)
    expect(isAgentAllowedByPolicy('codex', ['claude'])).toBe(false)
    expect(isAgentAllowedByPolicy('gemini', ['claude'])).toBe(false)
  })
})

describe('filterAgentsByPolicy', () => {
  const catalog = [{ id: 'claude' }, { id: 'codex' }, { id: 'gemini' }]

  it('returns a copy of every item when unrestricted', () => {
    expect(filterAgentsByPolicy(catalog, (a) => a.id, null)).toEqual(catalog)
  })

  it('drops items whose agent id is not on the allowlist', () => {
    expect(filterAgentsByPolicy(catalog, (a) => a.id, ['claude'])).toEqual([{ id: 'claude' }])
  })

  it('keeps allowlist order-independent membership', () => {
    expect(filterAgentsByPolicy(catalog, (a) => a.id, ['gemini', 'claude'])).toEqual([
      { id: 'claude' },
      { id: 'gemini' }
    ])
  })
})

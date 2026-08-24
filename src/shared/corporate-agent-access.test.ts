import { describe, expect, it } from 'vitest'
import {
  filterAgentsByPolicy,
  filterModelsByPolicy,
  isAgentAllowedByPolicy,
  isModelAllowedByPolicy
} from './corporate-agent-access'

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

// Why a model allowlist exists at all: the picker lists what the agent BINARY knows, and
// whether this fleet's gateway serves a given model is a separate fact that only shows up when
// a request is refused mid-turn. Probing the CLI cannot answer it — only the admin can.
describe('isModelAllowedByPolicy', () => {
  it('is unrestricted when the policy names nothing', () => {
    expect(isModelAllowedByPolicy('fable', null)).toBe(true)
    expect(isModelAllowedByPolicy('fable', undefined)).toBe(true)
  })

  it('matches a family entry against every spelling of that model', () => {
    const allowed = ['opus', 'sonnet']
    // CLI alias, the picker's version-qualified value, and the resolved API id.
    expect(isModelAllowedByPolicy('opus', allowed)).toBe(true)
    expect(isModelAllowedByPolicy('opus[1m]', allowed)).toBe(true)
    expect(isModelAllowedByPolicy('claude-fable-5[1m]', ['claude-fable'])).toBe(true)
    expect(isModelAllowedByPolicy('fable', allowed)).toBe(false)
  })

  it('ignores case and padding in the policy document', () => {
    expect(isModelAllowedByPolicy('Opus[1m]', [' OPUS '])).toBe(true)
  })
})

describe('filterModelsByPolicy', () => {
  const models = [{ id: 'fable' }, { id: 'opus[1m]' }, { id: 'sonnet' }]

  it('drops the models the fleet does not serve', () => {
    expect(filterModelsByPolicy(models, (m) => m.id, ['opus', 'sonnet'])).toEqual([
      { id: 'opus[1m]' },
      { id: 'sonnet' }
    ])
  })

  // An empty picker is a broken app: a typo'd allowlist must not make the agent unusable.
  it('ignores an allowlist that would leave nothing selectable', () => {
    expect(filterModelsByPolicy(models, (m) => m.id, ['typo'])).toEqual(models)
  })
})

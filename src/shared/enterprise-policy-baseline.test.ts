import { describe, expect, it } from 'vitest'
import {
  applyBuiltInAgentAllowlist,
  applyEnterprisePolicyBaseline,
  BUILT_IN_AGENT_ALLOWLIST
} from './enterprise-policy-baseline'

const BUNDLED = {
  lockdown: true,
  disableVoice: true,
  disableTelemetry: true,
  enforceNetworkAllowlist: true,
  allowedAgents: ['claude', 'opencode'],
  llmEndpoints: [{ id: 'ds', label: 'x', baseUrl: 'https://llm.example/v1', api: 'openai' }],
  allowedNetworkHosts: ['extra.example'],
  githubEnterpriseHost: 'ghes.example'
}

describe('applyEnterprisePolicyBaseline', () => {
  // The exact fleet regression: a GPO file written before `allowedAgents` existed reads as
  // fully locked in every other attribute while every agent stays selectable.
  it('supplies an agent allowlist the adopted file never mentions', () => {
    const { document, appliedKeys } = applyEnterprisePolicyBaseline({ lockdown: true }, BUNDLED)

    expect(document).toMatchObject({ allowedAgents: ['claude', 'opencode'] })
    expect(appliedKeys).toContain('allowedAgents')
  })

  it('never overrides a key the adopted file sets, even to a laxer value', () => {
    const { document, appliedKeys } = applyEnterprisePolicyBaseline(
      { allowedAgents: ['claude', 'codex'], disableVoice: false, lockdown: false },
      BUNDLED
    )

    expect(document).toMatchObject({
      allowedAgents: ['claude', 'codex'],
      disableVoice: false,
      lockdown: false
    })
    expect(appliedKeys).not.toContain('allowedAgents')
    expect(appliedKeys).not.toContain('disableVoice')
    expect(appliedKeys).not.toContain('lockdown')
  })

  // The security boundary. A per-user NSIS install puts the bundled file in a directory the
  // standard user owns, so a `false` there must not punch a hole in an administrator's file.
  it('ignores a baseline that would relax a switch', () => {
    const { document, appliedKeys } = applyEnterprisePolicyBaseline(
      { lockdown: true },
      { ...BUNDLED, disableVoice: false, disablePlugins: false }
    )

    expect(document).not.toHaveProperty('disableVoice')
    expect(document).not.toHaveProperty('disablePlugins')
    expect(appliedKeys).not.toContain('disableVoice')
  })

  // These widen rather than restrict, and the administrator's file owns them outright.
  it('never contributes configuration keys', () => {
    const { document, appliedKeys } = applyEnterprisePolicyBaseline({ lockdown: true }, BUNDLED)

    expect(document).not.toHaveProperty('llmEndpoints')
    expect(document).not.toHaveProperty('allowedNetworkHosts')
    expect(document).not.toHaveProperty('githubEnterpriseHost')
    expect(appliedKeys).not.toContain('llmEndpoints')
  })

  it('accepts the stringly-typed booleans the resolver accepts', () => {
    const { appliedKeys } = applyEnterprisePolicyBaseline({}, { disableVoice: 'yes' })

    expect(appliedKeys).toEqual(['disableVoice'])
  })

  // An allowlist the resolver would discard as empty must not be recorded as an applied
  // restriction it never imposed.
  it('does not claim an allowlist the resolver would drop', () => {
    expect(applyEnterprisePolicyBaseline({}, { allowedAgents: [] }).appliedKeys).toEqual([])
    expect(applyEnterprisePolicyBaseline({}, { allowedAgents: ['  '] }).appliedKeys).toEqual([])
    expect(applyEnterprisePolicyBaseline({}, { allowedAgents: 'claude' }).appliedKeys).toEqual([])
  })

  it('leaves a malformed document alone so the resolver still warns about it', () => {
    expect(applyEnterprisePolicyBaseline(null, BUNDLED).document).toBeNull()
    expect(applyEnterprisePolicyBaseline([1, 2], BUNDLED).document).toEqual([1, 2])
    expect(applyEnterprisePolicyBaseline({ lockdown: true }, 'nope').document).toEqual({
      lockdown: true
    })
  })

  it('does not mutate the adopted document', () => {
    const adopted = { lockdown: true }
    applyEnterprisePolicyBaseline(adopted, BUNDLED)

    expect(adopted).toEqual({ lockdown: true })
  })
})

describe('applyBuiltInAgentAllowlist', () => {
  // The gap the file baseline cannot cover: discovery found nothing, so there is no adopted
  // document to fill. An absent list means NO restriction, so this is the case where deleting
  // the shipped policy file would put every vendor CLI back in the pickers.
  it('restricts agents when discovery resolved no document at all', () => {
    const { document, appliedKeys } = applyBuiltInAgentAllowlist(null)

    expect(appliedKeys).toEqual(['allowedAgents'])
    expect(document).toEqual({ allowedAgents: [...BUILT_IN_AGENT_ALLOWLIST] })
  })

  it('fills a document that never mentions the key', () => {
    const { document, appliedKeys } = applyBuiltInAgentAllowlist({ lockdown: true })

    expect(appliedKeys).toEqual(['allowedAgents'])
    expect(document).toMatchObject({
      lockdown: true,
      allowedAgents: [...BUILT_IN_AGENT_ALLOWLIST]
    })
  })

  // Widening stays the administrator's call: an explicit list in the machine-wide file is the
  // supported way to add an agent, and this floor must not fight it.
  it('leaves an explicit administrator list untouched, including a wider one', () => {
    const adopted = { allowedAgents: ['claude', 'opencode', 'codex'] }
    const { document, appliedKeys } = applyBuiltInAgentAllowlist(adopted)

    expect(appliedKeys).toEqual([])
    expect(document).toBe(adopted)
  })

  // A list the resolver would discard is still an explicit statement; re-filling it here would
  // make the trace claim a restriction that readAgentAllowlist then throws away.
  it('does not second-guess an explicit list the resolver will reject', () => {
    const adopted = { allowedAgents: [] }
    const { document, appliedKeys } = applyBuiltInAgentAllowlist(adopted)

    expect(appliedKeys).toEqual([])
    expect(document).toBe(adopted)
  })

  it('returns a malformed document untouched so the resolver still warns about it', () => {
    const { document, appliedKeys } = applyBuiltInAgentAllowlist('nonsense')

    expect(appliedKeys).toEqual([])
    expect(document).toBe('nonsense')
  })
})

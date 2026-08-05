import { describe, expect, it } from 'vitest'
import { applyEnterprisePolicyBaseline } from './enterprise-policy-baseline'

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

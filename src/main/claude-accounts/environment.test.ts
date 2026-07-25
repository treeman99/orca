import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyClaudeEnvPatch, hasClaudeAuthEnvConflict } from './environment'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../enterprise/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.fn(() => makeEnterprisePolicy())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))

function bedrockEnv(): Record<string, string> {
  return {
    AWS_BEARER_TOKEN_BEDROCK: 'bedrock-bearer',
    AWS_PROFILE: 'samsungds-sso',
    AWS_REGION: 'us-east-1',
    CLAUDE_CODE_USE_BEDROCK: '1',
    ANTHROPIC_API_KEY: 'inherited-key',
    ANTHROPIC_CUSTOM_HEADERS: 'Authorization: Bearer inherited'
  }
}

describe('applyClaudeEnvPatch', () => {
  beforeEach(() => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
  })

  it('strips Anthropic/Bedrock auth vars for a managed account by default', () => {
    const env = applyClaudeEnvPatch(bedrockEnv(), {}, { stripAuthEnv: true })

    expect(env.AWS_BEARER_TOKEN_BEDROCK).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toBeUndefined()
  })

  it('removes no AWS variable when managed Claude accounts are disabled', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    const env = applyClaudeEnvPatch(bedrockEnv(), {}, { stripAuthEnv: true })

    expect(env).toMatchObject(bedrockEnv())
  })

  it('still applies the config-dir patch under the switch', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    const env = applyClaudeEnvPatch(
      bedrockEnv(),
      { CLAUDE_CONFIG_DIR: '/home/alice/.claude' },
      { stripAuthEnv: true }
    )

    expect(env.CLAUDE_CONFIG_DIR).toBe('/home/alice/.claude')
    expect(env.AWS_BEARER_TOKEN_BEDROCK).toBe('bedrock-bearer')
  })

  it('keeps stripping when lockdown opts managed Claude accounts back in', () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeLockdownPolicy({ disableManagedClaudeAccounts: false })
    )

    const env = applyClaudeEnvPatch(bedrockEnv(), {}, { stripAuthEnv: true })

    expect(env.AWS_BEARER_TOKEN_BEDROCK).toBeUndefined()
  })
})

describe('hasClaudeAuthEnvConflict', () => {
  it('reports the inherited Bedrock bearer token as a conflict', () => {
    expect(hasClaudeAuthEnvConflict({ AWS_BEARER_TOKEN_BEDROCK: 'x' })).toBe(true)
  })

  it('ignores non-auth AWS variables', () => {
    expect(hasClaudeAuthEnvConflict({ AWS_PROFILE: 'sso', AWS_REGION: 'us-east-1' })).toBe(false)
  })
})

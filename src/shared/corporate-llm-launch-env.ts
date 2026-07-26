// Turns a provisioned endpoint plus the user's own token into the environment an
// agent CLI needs in order to talk to the company's self-hosted model.
//
// Pure on purpose: the token arrives as an argument and is never read from disk
// or process.env here, so this module can be unit-tested without a secret and
// there is exactly one place that decides which variable names are written.

import { enterpriseLlmEndpointHost, type EnterpriseLlmEndpoint } from './enterprise-llm-endpoints'

export type CorporateLlmLaunchEnvInput = {
  endpoint: EnterpriseLlmEndpoint
  token: string
  /** The environment the result will be merged into, read for NO_PROXY only. */
  baseEnv?: Record<string, string | undefined>
}

// Why: an in-house endpoint sits inside the corporate network, so sending it
// through the external proxy is either a failure or an unnecessary exposure of
// prompt traffic. Merge rather than replace — the existing list is load-bearing.
function bypassProxyFor(host: string, baseEnv: Record<string, string | undefined>): string {
  const existing = baseEnv.NO_PROXY ?? baseEnv.no_proxy ?? ''
  const rules = existing
    .split(/[;,]/)
    .map((rule) => rule.trim())
    .filter(Boolean)
  if (!rules.some((rule) => rule.toLowerCase() === host)) {
    rules.push(host)
  }
  return rules.join(',')
}

/**
 * Environment variables that point one agent launch at `endpoint`.
 *
 * Anthropic-protocol services are addressed the way Claude Code addresses a
 * custom base URL; OpenAI-protocol services the way an OpenAI-compatible client
 * does. Both names are the CLI's own contract, not something Orca invents — if a
 * fleet's agent expects different names, add a case here rather than teaching
 * users to hand-set variables that the lockdown then has to reason about.
 */
export function corporateLlmLaunchEnv(input: CorporateLlmLaunchEnvInput): Record<string, string> {
  const { endpoint, token } = input
  const baseEnv = input.baseEnv ?? {}
  const env: Record<string, string> =
    endpoint.api === 'anthropic'
      ? { ANTHROPIC_BASE_URL: endpoint.baseUrl, ANTHROPIC_AUTH_TOKEN: token }
      : { OPENAI_BASE_URL: endpoint.baseUrl, OPENAI_API_KEY: token }

  if (endpoint.model) {
    if (endpoint.api === 'anthropic') {
      env.ANTHROPIC_MODEL = endpoint.model
    } else {
      env.OPENAI_MODEL = endpoint.model
    }
  }

  const host = enterpriseLlmEndpointHost(endpoint)
  if (host) {
    const noProxy = bypassProxyFor(host, baseEnv)
    env.NO_PROXY = noProxy
    env.no_proxy = noProxy
  }

  return env
}

/** Variable names this module can write, for redaction and for teardown. */
export const CORPORATE_LLM_ENV_VARS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_MODEL',
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL'
] as const

/** The subset that carries a secret and must never be logged or persisted. */
export const CORPORATE_LLM_SECRET_ENV_VARS = ['ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY'] as const

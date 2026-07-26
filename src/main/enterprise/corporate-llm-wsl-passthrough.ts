// WSLENV entries a WSL agent needs before it can reach the company's self-hosted
// model or trust the corporate certificate authority.
//
// wsl.exe imports ONLY the variables named in WSLENV, so everything main resolves
// on the Windows side — the endpoint URL, the token, the NO_PROXY exemption — stops
// at the boundary unless it is listed here. Without this, choosing the corporate
// endpoint appears to work and the agent silently keeps talking to Bedrock.

const VALUE_VARS = [
  // Resolved by corporate-llm-launch-injection before the spawn.
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_MODEL',
  // Why: carries the endpoint host. A guest that has a proxy configured would
  // otherwise send in-house prompt traffic through the external proxy.
  'NO_PROXY',
  'no_proxy',
  // Not a secret; crossing it lets a user confirm the backend from inside WSL.
  'ORCA_CORPORATE_LLM_ENDPOINT'
] as const

// Why: a certificate bundle is a PATH. A Windows value must be translated for the
// guest (/p); a value the user already expressed as a Linux path must not be (/u).
const PATH_VARS = ['NODE_EXTRA_CA_CERTS'] as const

/**
 * WSLENV entries for the variables that are actually set. Absent variables are
 * skipped so WSLENV does not accumulate names that never cross anything.
 */
export function corporateLlmWslenvEntries(env: Record<string, string | undefined>): string[] {
  const entries: string[] = []
  for (const name of VALUE_VARS) {
    if (env[name]) {
      entries.push(`${name}/u`)
    }
  }
  for (const name of PATH_VARS) {
    const value = env[name]
    if (value) {
      entries.push(`${name}/${value.startsWith('/') ? 'u' : 'p'}`)
    }
  }
  return entries
}

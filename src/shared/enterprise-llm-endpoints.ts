// Self-hosted model endpoints an administrator provisions through the corporate
// policy file, so a user can point a session at the company's own open-weight
// model instead of a vendor cloud.
//
// The endpoint (URL, protocol, model) is administrator-owned; the TOKEN never is.
// A token identifies a person, so it is entered by the user and stored encrypted
// in their own profile — see src/main/enterprise/corporate-llm-token-store.ts.
// The policy file lives at a machine-wide path every account on the box can read,
// which is exactly the wrong place for a per-user secret.

/** Which wire protocol the in-house service speaks. */
export type EnterpriseLlmApi = 'anthropic' | 'openai'

export type EnterpriseLlmEndpoint = {
  /** Stable key used by the picker and by the token store. */
  id: string
  label: string
  baseUrl: string
  api: EnterpriseLlmApi
  /** Model id the service expects, when it does not default to one. */
  model: string | null
}

const API_VALUES: ReadonlySet<string> = new Set<EnterpriseLlmApi>(['anthropic', 'openai'])

// Why: a token is sent to whatever this URL says, so a typo that silently
// downgrades to http:// would leak it in clear text on the corporate network.
function readBaseUrl(raw: unknown, id: string, warnings: string[]): string | null {
  if (typeof raw !== 'string' || !raw.trim()) {
    warnings.push(`llmEndpoints["${id}"].baseUrl must be a URL; ignoring the entry.`)
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    warnings.push(`llmEndpoints["${id}"].baseUrl is not a valid URL; ignoring the entry.`)
    return null
  }
  if (parsed.protocol !== 'https:' && !isLoopback(parsed.hostname)) {
    warnings.push(
      `llmEndpoints["${id}"].baseUrl must use https (loopback may use http); ignoring the entry.`
    )
    return null
  }
  return parsed.toString().replace(/\/$/, '')
}

function isLoopback(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '')
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function readString(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function readEndpoint(
  raw: unknown,
  index: number,
  warnings: string[]
): EnterpriseLlmEndpoint | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warnings.push(`llmEndpoints[${index}] must be an object; ignoring the entry.`)
    return null
  }
  const entry = raw as Record<string, unknown>
  const id = readString(entry.id)
  if (!id) {
    warnings.push(`llmEndpoints[${index}] needs a non-empty "id"; ignoring the entry.`)
    return null
  }
  const api = readString(entry.api) ?? 'openai'
  if (!API_VALUES.has(api)) {
    warnings.push(`llmEndpoints["${id}"].api must be "anthropic" or "openai"; ignoring the entry.`)
    return null
  }
  const baseUrl = readBaseUrl(entry.baseUrl, id, warnings)
  if (!baseUrl) {
    return null
  }
  return {
    id,
    label: readString(entry.label) ?? id,
    baseUrl,
    api: api as EnterpriseLlmApi,
    model: readString(entry.model)
  }
}

/**
 * Parse the policy document's `llmEndpoints` array. Unusable entries are dropped
 * with a warning rather than failing the whole policy: one malformed endpoint
 * must not cost the fleet its lockdown switches.
 */
export function resolveEnterpriseLlmEndpoints(
  raw: unknown,
  warnings: string[]
): EnterpriseLlmEndpoint[] {
  if (raw === undefined) {
    return []
  }
  if (!Array.isArray(raw)) {
    warnings.push('"llmEndpoints" must be an array; ignoring it.')
    return []
  }
  const endpoints: EnterpriseLlmEndpoint[] = []
  const seen = new Set<string>()
  for (const [index, entry] of raw.entries()) {
    const endpoint = readEndpoint(entry, index, warnings)
    if (!endpoint) {
      continue
    }
    if (seen.has(endpoint.id)) {
      warnings.push(`llmEndpoints["${endpoint.id}"] is declared twice; keeping the first.`)
      continue
    }
    seen.add(endpoint.id)
    endpoints.push(endpoint)
  }
  return endpoints
}

/**
 * Validate a single user-entered endpoint (label/baseUrl/api/model) from the UI.
 * Applies the same https-only rule as the policy parser so a user cannot leak their
 * token over http. Returns a normalized value (without id) or a human-readable error.
 */
export function validateUserLlmEndpointInput(input: {
  label?: unknown
  baseUrl?: unknown
  api?: unknown
  model?: unknown
}):
  | {
      ok: true
      value: { label: string; baseUrl: string; api: EnterpriseLlmApi; model: string | null }
    }
  | { ok: false; message: string } {
  const warnings: string[] = []
  const baseUrl = readBaseUrl(input.baseUrl, 'endpoint', warnings)
  if (!baseUrl) {
    return { ok: false, message: warnings[0] ?? 'A valid https base URL is required.' }
  }
  const api = readString(input.api) ?? 'openai'
  if (!API_VALUES.has(api)) {
    return { ok: false, message: 'Protocol must be "anthropic" or "openai".' }
  }
  return {
    ok: true,
    value: {
      label: readString(input.label) ?? baseUrl,
      baseUrl,
      api: api as EnterpriseLlmApi,
      model: readString(input.model)
    }
  }
}

// Kept local rather than reusing enterprise-policy's normalizeHost: that module
// imports this one for the policy field, and a cycle between them would be a
// module-init hazard for a value read during startup.
/** Host an endpoint talks to, for proxy-bypass and allowlist wiring. */
export function enterpriseLlmEndpointHost(endpoint: EnterpriseLlmEndpoint): string | null {
  try {
    return new URL(endpoint.baseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase() || null
  } catch {
    return null
  }
}

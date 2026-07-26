// Central policy for locked-down corporate deployments (e.g. behind a private
// GitHub Enterprise host with no access to vendor SaaS endpoints).
//
// Why a file instead of environment variables: anything Orca reads from `env` is
// also inherited by every process it spawns — agent CLIs, `gh`, `git`, the relay —
// and a machine-wide `setx` leaks into unrelated tooling on the same box. So the
// fork adds exactly ONE environment variable (the policy file's location) and
// keeps every switch inside an administrator-owned JSON file.
//
// This module is a pure function of the already-parsed document so it is
// trivially testable; discovery and file I/O live in src/main/enterprise/.

import {
  enterpriseLlmEndpointHost,
  resolveEnterpriseLlmEndpoints,
  type EnterpriseLlmEndpoint
} from './enterprise-llm-endpoints'

export type EnterprisePolicy = {
  /** Master switch. When on, every non-essential vendor phone-home defaults off. */
  lockdown: boolean
  /** Suppress PostHog telemetry and the diagnostics/crash bundle upload lane. */
  disableTelemetry: boolean
  /** Suppress electron-updater feed checks and the vendor update-nudge poll. */
  disableAutoUpdate: boolean
  /** Suppress the "star stablyai/orca" check/write that hits github.com SaaS. */
  disableStarNag: boolean
  /** Suppress Orca Cloud sign-in and the vendor-hosted mobile pairing relay. */
  disableCloudRelay: boolean
  /** Suppress AI-vendor usage/rate-limit polling (api.anthropic.com and friends). */
  disableUsagePolling: boolean
  /**
   * Suppress Orca's managed Claude accounts: the OAuth token rotation against
   * platform.claude.com, and the agent-environment rewriting that strips AWS
   * Bedrock credentials on the way to the PTY. On a Bedrock fleet the feature is
   * both an egress path and a functional hazard.
   */
  disableManagedClaudeAccounts: boolean
  /** Turn off Chromium's spellchecker, which downloads dictionaries from a CDN. */
  disableSpellcheck: boolean
  /** Opt-in hard allowlist over renderer + main-process HTTP. Never inherited. */
  enforceNetworkAllowlist: boolean
  /** Hosts the allowlist permits, normalized. Always includes the GHES host. */
  allowedNetworkHosts: readonly string[]
  /** Private GitHub Enterprise host, e.g. "github.samsungds.net". */
  githubEnterpriseHost: string | null
  /**
   * Self-hosted model endpoints a user may point a session at. Administrator-owned;
   * the per-user token is never here — see enterprise-llm-endpoints.ts.
   */
  llmEndpoints: readonly EnterpriseLlmEndpoint[]
  /** Absolute path of the policy file in effect, or null when none was found. */
  sourcePath: string | null
  /** Admin-facing complaints about the document (unknown keys, wrong types). */
  warnings: readonly string[]
}

export type EnterprisePolicyDocument = Record<string, unknown>
export type PolicyEnv = Record<string, string | undefined>

// Switches that default to the master `lockdown` value when the key is absent.
// Setting one explicitly to `false` opts that single feature back in.
export const LOCKDOWN_INHERITING_KEYS = [
  'disableTelemetry',
  'disableAutoUpdate',
  'disableStarNag',
  'disableCloudRelay',
  'disableUsagePolling',
  'disableManagedClaudeAccounts',
  'disableSpellcheck'
] as const

type LockdownInheritingKey = (typeof LOCKDOWN_INHERITING_KEYS)[number]

const KNOWN_KEYS: ReadonlySet<string> = new Set<string>([
  '$schema',
  'lockdown',
  'githubEnterpriseHost',
  'allowedNetworkHosts',
  'llmEndpoints',
  'enforceNetworkAllowlist',
  ...LOCKDOWN_INHERITING_KEYS
])

const TRUTHY: ReadonlySet<string> = new Set(['true', 'yes', 'on', '1'])
const FALSY: ReadonlySet<string> = new Set(['false', 'no', 'off', '0'])

function isPlainObject(value: unknown): value is EnterprisePolicyDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Returns undefined for an absent or unusable value so the caller falls back to
// the lockdown default via `??`. A blank or misspelled value must never read as
// "off" — that is how an admin typo silently unlocks a machine.
function readBoolean(
  document: EnterprisePolicyDocument,
  key: string,
  warnings: string[]
): boolean | undefined {
  const raw = document[key]
  if (raw === undefined) {
    return undefined
  }
  if (typeof raw === 'boolean') {
    return raw
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (TRUTHY.has(normalized)) {
      return true
    }
    if (FALSY.has(normalized)) {
      return false
    }
  }
  warnings.push(`"${key}" must be true or false; ignoring ${JSON.stringify(raw)}.`)
  return undefined
}

// Tolerates a full URL, a trailing slash/path, embedded credentials, and an
// explicit port so an admin can paste whatever they have in front of them.
export function normalizeHost(value: string | undefined | null): string | null {
  if (typeof value !== 'string') {
    return null
  }
  let host = value.trim().toLowerCase()
  if (!host) {
    return null
  }
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  host = host.split('/')[0] ?? host
  host = host.split('@').at(-1) ?? host
  host = host.split(':')[0] ?? host
  return host || null
}

function readHost(
  document: EnterprisePolicyDocument,
  key: string,
  warnings: string[]
): string | null {
  const raw = document[key]
  if (raw === undefined) {
    return null
  }
  if (typeof raw !== 'string') {
    warnings.push(`"${key}" must be a string hostname; ignoring ${JSON.stringify(raw)}.`)
    return null
  }
  const host = normalizeHost(raw)
  if (!host) {
    warnings.push(`"${key}" is blank; ignoring it.`)
  }
  return host
}

function readHostList(
  document: EnterprisePolicyDocument,
  key: string,
  warnings: string[]
): string[] {
  const raw = document[key]
  if (raw === undefined) {
    return []
  }
  if (!Array.isArray(raw)) {
    warnings.push(`"${key}" must be an array of hostnames; ignoring ${JSON.stringify(raw)}.`)
    return []
  }
  const hosts: string[] = []
  for (const entry of raw) {
    const host = normalizeHost(typeof entry === 'string' ? entry : null)
    if (host) {
      hosts.push(host)
    } else {
      warnings.push(`"${key}" entry ${JSON.stringify(entry)} is not a hostname; ignoring it.`)
    }
  }
  return hosts
}

/**
 * Resolve the effective policy from an already-parsed document.
 *
 * `env` is consulted for exactly one thing: `GH_HOST`, which is the `gh` CLI's
 * own variable and is therefore already present on these machines — the fork
 * does not invent it. Pass `null` for the document when no policy file exists.
 */
export function resolveEnterprisePolicy(
  document: unknown = null,
  env: PolicyEnv = {},
  sourcePath: string | null = null
): EnterprisePolicy {
  const warnings: string[] = []
  let effective: EnterprisePolicyDocument = {}
  if (isPlainObject(document)) {
    effective = document
  } else if (document !== null && document !== undefined) {
    warnings.push('Policy file must contain a JSON object; ignoring its contents.')
  }

  for (const key of Object.keys(effective)) {
    if (!KNOWN_KEYS.has(key)) {
      warnings.push(`Unknown policy key "${key}" ignored.`)
    }
  }

  const lockdown = readBoolean(effective, 'lockdown', warnings) ?? false
  const switches = {} as Record<LockdownInheritingKey, boolean>
  for (const key of LOCKDOWN_INHERITING_KEYS) {
    switches[key] = readBoolean(effective, key, warnings) ?? lockdown
  }

  const githubEnterpriseHost =
    readHost(effective, 'githubEnterpriseHost', warnings) ?? normalizeHost(env.GH_HOST)
  const allowed = new Set(readHostList(effective, 'allowedNetworkHosts', warnings))
  if (githubEnterpriseHost) {
    allowed.add(githubEnterpriseHost)
  }
  const llmEndpoints = resolveEnterpriseLlmEndpoints(effective.llmEndpoints, warnings)
  // Why: an administrator who provisions an endpoint has already decided it is
  // reachable, so making them repeat it in allowedNetworkHosts is a trap.
  for (const endpoint of llmEndpoints) {
    const host = enterpriseLlmEndpointHost(endpoint)
    if (host) {
      allowed.add(host)
    }
  }

  return {
    lockdown,
    ...switches,
    // Not lockdown-inherited: a hard allowlist can break a deployment in ways the
    // feature switches cannot, so it stays opt-in even under the master switch.
    enforceNetworkAllowlist: readBoolean(effective, 'enforceNetworkAllowlist', warnings) ?? false,
    allowedNetworkHosts: [...allowed],
    githubEnterpriseHost,
    llmEndpoints,
    sourcePath,
    warnings
  }
}

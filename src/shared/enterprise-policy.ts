// Central policy for locked-down corporate deployments (e.g. behind a private
// GitHub Enterprise host with no access to vendor SaaS endpoints). Every switch
// is read from the environment so a self-built exe can be configured at launch
// without recompiling. Kept as a pure function of `env` so it is trivially
// testable and never reaches for `process.env` implicitly.

export type EnterprisePolicy = {
  /** Master switch. When on, every non-essential vendor phone-home defaults off. */
  lockdown: boolean
  /** Suppress PostHog/diagnostics telemetry regardless of the opt-in banner. */
  disableTelemetry: boolean
  /** Suppress electron-updater feed checks and the vendor update-nudge poll. */
  disableAutoUpdate: boolean
  /** Suppress the "star stablyai/orca" check/write that hits github.com SaaS. */
  disableStarNag: boolean
}

export type PolicyEnv = Record<string, string | undefined>

const TRUTHY = new Set(['1', 'true', 'yes', 'on'])
const FALSY = new Set(['0', 'false', 'no', 'off', ''])

// Undefined when the var is absent or unrecognized, so an individual switch can
// cleanly fall back to the master lockdown default via `??`.
function readFlag(env: PolicyEnv, name: string): boolean | undefined {
  const raw = env[name]
  if (raw === undefined) {
    return undefined
  }
  const normalized = raw.trim().toLowerCase()
  if (TRUTHY.has(normalized)) {
    return true
  }
  if (FALSY.has(normalized)) {
    return false
  }
  return undefined
}

export function resolveEnterprisePolicy(env: PolicyEnv = {}): EnterprisePolicy {
  const lockdown = readFlag(env, 'ORCA_ENTERPRISE_LOCKDOWN') ?? false
  // Telemetry also honors the community DO_NOT_TRACK / product-specific kill
  // switch that telemetry/consent.ts already enforces; mirror them here so a
  // single policy object reflects the true effective state.
  const disableTelemetry =
    readFlag(env, 'ORCA_DISABLE_TELEMETRY') ??
    readFlag(env, 'ORCA_TELEMETRY_DISABLED') ??
    readFlag(env, 'DO_NOT_TRACK') ??
    lockdown
  return {
    lockdown,
    disableTelemetry,
    disableAutoUpdate: readFlag(env, 'ORCA_DISABLE_AUTO_UPDATE') ?? lockdown,
    disableStarNag: readFlag(env, 'ORCA_DISABLE_STAR_NAG') ?? lockdown
  }
}

// The private GitHub Enterprise host (e.g. "github.samsungds.net"). Honors
// Orca's own var first, then gh's native GH_HOST. Normalized to a bare
// lowercase hostname so provider detection can match a git remote against it.
export function resolveEnterpriseGitHubHost(env: PolicyEnv = {}): string | null {
  const raw = env.ORCA_GITHUB_ENTERPRISE_HOST ?? env.GH_HOST
  if (raw === undefined) {
    return null
  }
  return normalizeHost(raw)
}

function normalizeHost(value: string): string | null {
  let host = value.trim().toLowerCase()
  if (!host) {
    return null
  }
  // Tolerate a full URL, a trailing slash/path, and an explicit port.
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  host = host.split('/')[0] ?? host
  host = host.split('@').at(-1) ?? host
  host = host.split(':')[0] ?? host
  return host || null
}

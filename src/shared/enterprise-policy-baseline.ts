// The build's own policy file as a FLOOR under whichever file discovery adopted.
//
// Why this exists: candidates are first-parse-wins with no merging, so a machine-wide file
// deployed before a switch existed silently relaxes it. `allowedAgents` is the sharp case —
// it does NOT inherit `lockdown`, so a stale `{"lockdown": true}` pushed by GPO reads as
// fully locked in every other attribute while every agent stays selectable, which is exactly
// how a locked fleet ends up still offering Codex.
//
// Why a floor and not a plain merge: on a per-user NSIS install the bundled file sits in a
// directory the standard user owns, so nothing it says may RELAX what an administrator
// deployed. Two rules keep that true:
//   1. it only fills keys the adopted document does not mention — an explicit value always wins;
//   2. it may only contribute a restriction: a `true` switch, or an agent allowlist where there
//      was none. A `false` in the baseline is ignored.
// Configuration keys (llmEndpoints, allowedNetworkHosts, githubEnterpriseHost) are excluded
// outright — they widen rather than restrict, and the administrator's file owns them.

import { LOCKDOWN_INHERITING_KEYS, type EnterprisePolicyDocument } from './enterprise-policy'

// `lockdown` and `enforceNetworkAllowlist` are not in LOCKDOWN_INHERITING_KEYS (nothing
// inherits from them) but are the same shape: true restricts, false does not.
const BASELINE_BOOLEAN_KEYS: readonly string[] = [
  'lockdown',
  'enforceNetworkAllowlist',
  ...LOCKDOWN_INHERITING_KEYS
]

// Mirrors the resolver's tolerance for admin-authored booleans; the baseline is our own
// file, but accepting only `true` here would fail OPEN on a stringly-typed edit.
const TRUTHY: ReadonlySet<string> = new Set(['true', 'yes', 'on', '1'])

function isPlainObject(value: unknown): value is EnterprisePolicyDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRestrictiveBoolean(value: unknown): boolean {
  return value === true || (typeof value === 'string' && TRUTHY.has(value.trim().toLowerCase()))
}

// Matches readAgentAllowlist's usability bar: a list the resolver would discard as empty
// must not be recorded as an applied restriction it never imposed.
function isUsableAgentAllowlist(value: unknown): boolean {
  return (
    Array.isArray(value) && value.some((entry) => typeof entry === 'string' && entry.trim() !== '')
  )
}

export type PolicyBaselineResult = {
  /** The adopted document with the baseline's restrictions filled in. */
  readonly document: unknown
  /** Keys the baseline contributed, for the admin-facing resolution trace. */
  readonly appliedKeys: readonly string[]
}

/**
 * Fill the gaps in `adopted` from `baseline`, restrictions only.
 *
 * Returns `adopted` untouched when either side is not a JSON object, so the resolver still
 * sees — and warns about — a malformed document rather than having it quietly replaced.
 */
export function applyEnterprisePolicyBaseline(
  adopted: unknown,
  baseline: unknown
): PolicyBaselineResult {
  if (!isPlainObject(adopted) || !isPlainObject(baseline)) {
    return { document: adopted, appliedKeys: [] }
  }
  const merged: EnterprisePolicyDocument = { ...adopted }
  const appliedKeys: string[] = []
  for (const key of BASELINE_BOOLEAN_KEYS) {
    if (key in adopted || !isRestrictiveBoolean(baseline[key])) {
      continue
    }
    // Normalized to `true` rather than copied: only restrictive values reach here, and the
    // trace should not have to explain that the string "yes" became a lockdown.
    merged[key] = true
    appliedKeys.push(key)
  }
  if (!('allowedAgents' in adopted) && isUsableAgentAllowlist(baseline.allowedAgents)) {
    merged.allowedAgents = baseline.allowedAgents
    appliedKeys.push('allowedAgents')
  }
  return { document: merged, appliedKeys }
}

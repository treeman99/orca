// Durable, admin-facing record of the policy that actually took effect.
//
// Why this exists at all: policy resolution runs before `initObservability()`
// installs the trace sink, and on the target fleet (Windows, per-user NSIS
// install, launched from the Start Menu) the process has no console — so the
// stderr diagnostics in enterprise-policy-file.ts are written into a
// contentless stub and lost. That is why an encoding mistake or a mistyped key
// could silently leave a "locked" machine unlocked with nothing to inspect.
//
// So the diagnostics are buffered during resolution and flushed here, from the
// main-process composition root, as one span in the existing NDJSON lane
// (%APPDATA%\Orca\logs\main.trace.ndjson on Windows). No parallel log file.

import { startSpan } from '../observability/tracer'
import { LOCKDOWN_INHERITING_KEYS } from '../../shared/enterprise-policy'
import { getEnterprisePolicy, getEnterprisePolicyResolutionTrace } from './enterprise-policy-file'

const NO_FILE_FOUND = '(none found)'
const UNRESTRICTED_AGENTS = '(unrestricted)'

/**
 * Emit the one-shot `enterprise.policy` span. Call once, immediately after
 * `initObservability()` — earlier and the tracer has no sink, so the span is a
 * no-op. Safe to call when no policy file exists: the "none found" record is
 * exactly what an admin needs when a deployment did not take.
 */
export function recordEnterprisePolicyTrace(): void {
  const policy = getEnterprisePolicy()
  const { searchedPaths, notices } = getEnterprisePolicyResolutionTrace()
  const switches: Record<string, boolean> = {}
  for (const key of LOCKDOWN_INHERITING_KEYS) {
    switches[key] = policy[key]
  }
  const span = startSpan('enterprise.policy', {
    attributes: {
      kind: 'enterprise',
      'enterprise.policy.source_path': policy.sourcePath ?? NO_FILE_FOUND,
      'enterprise.policy.searched_paths': [...searchedPaths],
      'enterprise.policy.lockdown': policy.lockdown,
      'enterprise.policy.switches': switches,
      // Why separate from `switches`: allowedAgents does NOT inherit lockdown, so a locked
      // machine with the key missing or mistyped reads as fully locked in every other
      // attribute while every agent stays selectable. `(unrestricted)` is the finding.
      'enterprise.policy.allowed_agents': policy.allowedAgents
        ? [...policy.allowedAgents]
        : UNRESTRICTED_AGENTS,
      'enterprise.policy.github_enterprise_host': policy.githubEnterpriseHost,
      'enterprise.policy.enforce_network_allowlist': policy.enforceNetworkAllowlist,
      'enterprise.policy.allowed_network_hosts': [...policy.allowedNetworkHosts],
      // Already includes every entry of `policy.warnings`; getEnterprisePolicy
      // routes those through the same `warn()` the read/parse failures use.
      'enterprise.policy.warnings': [...notices]
    }
  })
  span.end()
}

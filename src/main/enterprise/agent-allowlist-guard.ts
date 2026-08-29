// Enforcement for the policy's `allowedAgents` list on the spawn side.
//
// The renderer already narrows every picker (src/renderer/src/lib/agent-catalog.tsx), but
// hiding a row is not a refusal: a keyboard chord bound before the policy arrived, the
// `orca` CLI, a paired mobile/web client, and an orchestration dispatch all reach the same
// launch paths without ever consulting the renderer. So the ids that actually reach a PTY
// are checked here, in main, where the policy file lives.
//
// `null` means unrestricted — the upstream behavior — so a build with no policy file
// never throws from any of this.

import { isAgentAllowedByPolicy } from '../../shared/corporate-agent-access'
import { getEnterprisePolicy } from './enterprise-policy-file'

export const AGENT_BLOCKED_BY_POLICY = 'agent_blocked_by_enterprise_policy'

export function isAgentAllowedByEnterprisePolicy(agent: string): boolean {
  return isAgentAllowedByPolicy(agent, getEnterprisePolicy().allowedAgents)
}

/** Throws when the corporate policy does not list `agent` among the selectable CLIs. */
export function assertAgentAllowedByEnterprisePolicy(agent: string): void {
  if (!isAgentAllowedByEnterprisePolicy(agent)) {
    // Why a human-readable suffix: this surfaces in a toast on the tab the user just
    // tried to open, and "agent_blocked_by_enterprise_policy" alone reads as a crash.
    throw new Error(
      `${AGENT_BLOCKED_BY_POLICY}: ${agent} is not permitted by your organization's Orca policy.`
    )
  }
}

/**
 * The allowlist refusal as a failure *result* rather than a throw: the source-control
 * text-generation entry points already report agent problems this way, and the panel
 * renders `error` inline.
 */
export function agentBlockedByPolicyResult(
  agentId: string
): { success: false; error: string } | null {
  if (isAgentAllowedByEnterprisePolicy(agentId)) {
    return null
  }
  return {
    success: false,
    error: `Agent "${agentId}" is not permitted by your organization's Orca policy.`
  }
}

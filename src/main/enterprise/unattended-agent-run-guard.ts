// `disableUnattendedAgentRuns`: Orca's own scheduler may not start an agent.
//
// Scoped to the unattended trigger only. A `manual` run is a person pressing Run now —
// they are at the keyboard and could have typed the same prompt into a terminal, so
// refusing it would remove a capability without removing a risk. A `scheduled` run is the
// timer acting on its own, which is the thing an administrator turns off.
//
// Gated in main, at AutomationService's single dispatch chokepoint, because the renderer
// is outside the trust boundary and because both entry points (the 60s tick and the
// headless serve dispatcher) already funnel through it. Hiding the schedule fields in the
// UI is a display decision; this is the block.

import type { AutomationRunTrigger } from '../../shared/automations-types'
import { getEnterprisePolicy } from './enterprise-policy-file'

export const UNATTENDED_AGENT_RUN_DISABLED_BY_POLICY =
  'Scheduled agent runs are turned off by your organization’s Orca policy.'

export function isUnattendedAgentRunDisabled(): boolean {
  return getEnterprisePolicy().disableUnattendedAgentRuns
}

/**
 * The refusal message for a run the policy forbids, or null when it is allowed.
 *
 * Returns a message rather than throwing so the caller records a `skipped_policy` run:
 * an administrator verifying the fleet needs the refusal to be visible in run history,
 * not swallowed.
 */
export function unattendedAgentRunRefusal(trigger: AutomationRunTrigger): string | null {
  if (trigger !== 'scheduled') {
    return null
  }
  return isUnattendedAgentRunDisabled() ? UNATTENDED_AGENT_RUN_DISABLED_BY_POLICY : null
}

/**
 * The refusal as an automation-run update. Kept beside the guard so `service.ts` states the
 * policy in one line at its dispatch chokepoint.
 */
export function unattendedAgentRunSkip(
  trigger: Parameters<typeof unattendedAgentRunRefusal>[0],
  run: { id: string },
  automation: { workspaceId: string | null }
): { runId: string; status: 'skipped_policy'; workspaceId: string | null; error: string } | null {
  const refusal = unattendedAgentRunRefusal(trigger)
  return refusal
    ? { runId: run.id, status: 'skipped_policy', workspaceId: automation.workspaceId, error: refusal }
    : null
}

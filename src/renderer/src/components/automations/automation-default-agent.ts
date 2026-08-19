import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import { isAgentAllowedByPolicy } from '../../../../shared/corporate-agent-access'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { TuiAgent } from '../../../../shared/tui-agent'

/**
 * The agent a brand-new automation draft starts on.
 *
 * The allowlist check on `defaultTuiAgent` is the fix for a real leak: a fleet-blocked
 * agent left in that setting seeded `draft.agentId`, and the editor deliberately keeps the
 * draft's own agent selectable so an existing automation can still be edited — so the
 * blocked agent reappeared in the create dialog's picker.
 */
export function resolveAutomationDefaultAgent(
  settings: Pick<GlobalSettings, 'defaultTuiAgent' | 'disabledTuiAgents'> | null | undefined,
  allowedAgents: readonly string[] | null,
  agentIds: readonly TuiAgent[],
  enabledAgents: readonly TuiAgent[]
): TuiAgent {
  const preferred = settings?.defaultTuiAgent
  if (
    preferred &&
    preferred !== 'blank' &&
    isTuiAgentEnabled(preferred, settings?.disabledTuiAgents) &&
    isAgentAllowedByPolicy(preferred, allowedAgents)
  ) {
    return preferred
  }
  return enabledAgents[0] ?? agentIds[0]
}

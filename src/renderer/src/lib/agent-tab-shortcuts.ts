import {
  agentTabActionId,
  type AgentTabActionId,
  type KeybindingOverrides
} from '../../../shared/keybindings'
import { ALL_TUI_AGENTS } from '../../../shared/tui-agent-display-names'
import { normalizeDisabledTuiAgents, pickTuiAgent } from '../../../shared/tui-agent-selection'
import { isAgentAllowedByPolicy } from '../../../shared/corporate-agent-access'
import { getPolicyAllowedAgents } from '../enterprise/enterprise-policy-access'
import type { TuiAgent } from '../../../shared/types'

export type BoundAgentTabAction = {
  agent: TuiAgent
  actionId: AgentTabActionId
}

/**
 * Agents whose per-agent "new tab" action has at least one user-assigned
 * chord. Per-agent actions ship with no default bindings, so only user
 * overrides can bind them. Disabled agents are skipped so a leftover binding
 * goes inert when the agent is turned off in Settings → Agents — and likewise
 * for one the corporate allowlist blocks, whose Settings row is already hidden
 * but whose previously-saved chord would otherwise still fire.
 */
export function listBoundAgentTabActions(
  keybindings: KeybindingOverrides | undefined,
  disabledTuiAgents: readonly TuiAgent[] | null | undefined
): BoundAgentTabAction[] {
  if (!keybindings) {
    return []
  }
  const allowedAgents = getPolicyAllowedAgents()
  const disabled = new Set(normalizeDisabledTuiAgents(disabledTuiAgents))
  const bound: BoundAgentTabAction[] = []
  for (const agent of ALL_TUI_AGENTS) {
    if (disabled.has(agent) || !isAgentAllowedByPolicy(agent, allowedAgents)) {
      continue
    }
    const actionId = agentTabActionId(agent)
    if ((keybindings[actionId] ?? []).length > 0) {
      bound.push({ agent, actionId })
    }
  }
  return bound
}

/**
 * Resolve which agent the `tab.newAgent` chord launches: the configured
 * default agent when it is detected and enabled, otherwise the shared
 * auto-pick order. A 'blank' default means "open new workspaces without an
 * agent" — an explicit new-agent-tab chord still wants an agent, so it falls
 * through to auto-pick instead of doing nothing.
 */
export function resolveDefaultAgentForNewTab(args: {
  defaultTuiAgent: TuiAgent | 'blank' | null | undefined
  detectedAgentIds: readonly TuiAgent[] | null | undefined
  disabledTuiAgents: readonly TuiAgent[] | null | undefined
}): TuiAgent | null {
  const allowedAgents = getPolicyAllowedAgents()
  // Why the preference is dropped rather than refused: `defaultTuiAgent` may predate the
  // policy, and the chord should still open a permitted agent instead of nothing.
  const configured = args.defaultTuiAgent === 'blank' ? null : args.defaultTuiAgent
  const preferred =
    configured && isAgentAllowedByPolicy(configured, allowedAgents) ? configured : null
  const detected = (args.detectedAgentIds ?? []).filter((agent) =>
    isAgentAllowedByPolicy(agent, allowedAgents)
  )
  return pickTuiAgent(preferred, detected, args.disabledTuiAgents)
}

import type { TuiAgent } from '../../../shared/types'
import {
  isTuiAgentEnabled,
  pickTuiAgent,
  TUI_AGENT_AUTO_PICK_ORDER
} from '../../../shared/tui-agent-selection'
import { filterAgentsByPolicy } from '../../../shared/corporate-agent-access'
import { getPolicyAllowedAgents } from '../enterprise/enterprise-policy-access'

export function pickQuickWorkspaceAgent(
  preferred: TuiAgent | 'blank' | null | undefined,
  detectedAgentIds: Iterable<TuiAgent> | null,
  disabledTuiAgents?: Iterable<unknown> | null
): TuiAgent | null {
  // Why the allowlist is applied to the fallback and not just the detected set: detection
  // is null while it is in flight, and the raw auto-pick order starts at claude → codex.
  // Without this the Create Workspace dialog opens pre-selected on a blocked agent and
  // submitting launches it — the picker list being filtered does not help.
  const candidates =
    detectedAgentIds ??
    filterAgentsByPolicy(TUI_AGENT_AUTO_PICK_ORDER, (agent) => agent, getPolicyAllowedAgents())
  return pickTuiAgent(preferred, candidates, disabledTuiAgents)
}

function hasDetectedAgent(detectedAgentIds: Iterable<TuiAgent>, agent: TuiAgent): boolean {
  if (detectedAgentIds instanceof Set) {
    return detectedAgentIds.has(agent)
  }
  for (const detectedAgentId of detectedAgentIds) {
    if (detectedAgentId === agent) {
      return true
    }
  }
  return false
}

function isQuickWorkspaceAgentAvailable(
  agent: TuiAgent,
  detectedAgentIds: Iterable<TuiAgent> | null,
  disabledTuiAgents?: Iterable<unknown> | null
): boolean {
  if (!isTuiAgentEnabled(agent, disabledTuiAgents)) {
    return false
  }
  return detectedAgentIds === null || hasDetectedAgent(detectedAgentIds, agent)
}

export function resolveQuickWorkspaceAgentSelection({
  quickAgentOverride,
  preferredQuickAgent,
  detectedAgentIds,
  disabledTuiAgents
}: {
  quickAgentOverride: TuiAgent | null | undefined
  preferredQuickAgent: TuiAgent | null
  detectedAgentIds: Iterable<TuiAgent> | null
  disabledTuiAgents?: Iterable<unknown> | null
}): {
  quickAgent: TuiAgent | null
  quickAgentOverride: TuiAgent | null | undefined
} {
  if (quickAgentOverride === undefined || quickAgentOverride === null) {
    return {
      quickAgent: quickAgentOverride === undefined ? preferredQuickAgent : null,
      quickAgentOverride
    }
  }
  if (isQuickWorkspaceAgentAvailable(quickAgentOverride, detectedAgentIds, disabledTuiAgents)) {
    return { quickAgent: quickAgentOverride, quickAgentOverride }
  }
  return { quickAgent: preferredQuickAgent, quickAgentOverride: preferredQuickAgent }
}

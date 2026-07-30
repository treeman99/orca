import {
  KEYBINDING_DEFINITIONS,
  agentTabActionId,
  type KeybindingActionId,
  type KeybindingDefinition
} from '../../../../shared/keybindings'
import { normalizeDisabledTuiAgents } from '../../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../../shared/types'
import { getEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'
import { getFullAgentCatalog } from '@/lib/agent-catalog'
import { isAgentAllowedByPolicy } from '../../../../shared/corporate-agent-access'

export type ShortcutGroup = {
  title: string
  items: KeybindingDefinition[]
}

export const EMPTY_DISABLED_TUI_AGENTS: readonly TuiAgent[] = []

export function disabledAgentTabActionIds(
  disabledTuiAgents: readonly TuiAgent[]
): KeybindingActionId[] {
  return normalizeDisabledTuiAgents(disabledTuiAgents).map((agent) => agentTabActionId(agent))
}

export function groupDefinitions(disabledTuiAgents: readonly TuiAgent[]): ShortcutGroup[] {
  // Why: per-agent launch rows only make sense for agents the user keeps
  // enabled in Settings → Agents; hiding disabled ones keeps the Agents group
  // scoped to what the chord could actually launch.
  const hiddenAgentActionIds = new Set<KeybindingActionId>(
    disabledAgentTabActionIds(disabledTuiAgents)
  )
  // Same reasoning for corporate policy: a rebindable chord for a feature the policy
  // removed is a row the user can edit but never fire.
  const policy = getEnterprisePolicyView()
  if (policy.disableVoice) {
    hiddenAgentActionIds.add('voice.dictation')
  }
  if (policy.disableMobileEmulator) {
    hiddenAgentActionIds.add('tab.newSimulator')
  }
  // Why the full catalog and not the detected set: a chord bound to a blocked agent fires
  // without detection (see the launch path in Terminal.tsx), so the row must go too.
  for (const agent of getFullAgentCatalog()) {
    if (!isAgentAllowedByPolicy(agent.id, policy.allowedAgents)) {
      hiddenAgentActionIds.add(agentTabActionId(agent.id))
    }
  }
  const groups = new Map<string, KeybindingDefinition[]>()
  for (const definition of KEYBINDING_DEFINITIONS) {
    if (hiddenAgentActionIds.has(definition.id)) {
      continue
    }
    groups.set(definition.group, [...(groups.get(definition.group) ?? []), definition])
  }
  return Array.from(groups.entries()).map(([title, items]) => ({ title, items }))
}

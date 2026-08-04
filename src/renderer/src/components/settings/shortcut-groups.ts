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

/**
 * Chords the corporate policy removes, whatever the user bound them to.
 *
 * Exported because the rendered rows and the settings-search index read the same
 * KEYBINDING_DEFINITIONS table: filtering only one of them left the removed feature
 * findable by name (and, through palette-results.ts, matchable in Cmd+J).
 */
export function policyHiddenShortcutActionIds(): Set<KeybindingActionId> {
  // Why a rebindable chord must go: it is a row the user can edit but never fire.
  const hidden = new Set<KeybindingActionId>()
  const policy = getEnterprisePolicyView()
  if (policy.disableVoice) {
    hidden.add('voice.dictation')
  }
  if (policy.disableMobileEmulator) {
    hidden.add('tab.newSimulator')
  }
  // Why the full catalog and not the detected set: a chord bound to a blocked agent fires
  // without detection (see the launch path in Terminal.tsx), so the row must go too.
  for (const agent of getFullAgentCatalog()) {
    if (!isAgentAllowedByPolicy(agent.id, policy.allowedAgents)) {
      hidden.add(agentTabActionId(agent.id))
    }
  }
  return hidden
}

export function groupDefinitions(
  disabledTuiAgents: readonly TuiAgent[],
  additionalDefinitions: readonly KeybindingDefinition[] = []
): ShortcutGroup[] {
  // Why: per-agent launch rows only make sense for agents the user keeps
  // enabled in Settings → Agents; hiding disabled ones keeps the Agents group
  // scoped to what the chord could actually launch.
  const hiddenAgentActionIds = new Set<KeybindingActionId>([
    ...disabledAgentTabActionIds(disabledTuiAgents),
    ...policyHiddenShortcutActionIds()
  ])
  const groups = new Map<string, KeybindingDefinition[]>()
  for (const definition of [...KEYBINDING_DEFINITIONS, ...additionalDefinitions]) {
    if (hiddenAgentActionIds.has(definition.id)) {
      continue
    }
    groups.set(definition.group, [...(groups.get(definition.group) ?? []), definition])
  }
  return Array.from(groups.entries()).map(([title, items]) => ({ title, items }))
}

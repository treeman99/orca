// Fork: upstream's agent-state-rules-live-update.ts downloads rule bundles from the vendor's GitHub
// releases at startup and every four hours — on the desktop, `orca serve` and remote orcad alike,
// where no desktop policy file reaches. That lane is removed with the in-app updater (README §6).
// This keeps the half that needs no network: the user's own override file over the bundled rules.

import { readFile } from 'node:fs/promises'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import {
  activateAgentStateRules,
  BUNDLED_AGENT_STATE_RULES,
  getActiveAgentStateRules,
  overlayOnBundledAgentStateRules,
  type ActiveAgentStateRules,
  type AgentStateRulesSource
} from './active-agent-state-rules'
import { parseAgentStateRulesBundle } from './agent-state-rules-bundle'

type SettingsStore = {
  getSettings: () => Pick<GlobalSettings, 'agentStateRulesPath'>
  onSettingsChanged: (listener: (updates: Partial<GlobalSettings>) => void) => unknown
}

type OnActivated = (rules: { version: number; source: AgentStateRulesSource }) => void

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function readOverride(path: string): Promise<ActiveAgentStateRules | null> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    console.warn(`[agent-state-rules] override ${path} unreadable: ${describeError(error)}`)
    return null
  }
  // Why any agent: the user chose this file, so the transcript gate on releases does not apply.
  const parsed = parseAgentStateRulesBundle(text, 'any-agent')
  if (!parsed.ok) {
    console.warn(`[agent-state-rules] override ${path} rejected: ${parsed.error}`)
    return null
  }
  return {
    files: overlayOnBundledAgentStateRules(parsed.bundle.files),
    version: parsed.bundle.version,
    source: 'override'
  }
}

/** Activates the override file (else the bundled rules), and again whenever its path changes. */
export function startAgentStateRulesLocalOverride(
  store: SettingsStore,
  onActivated: OnActivated
): void {
  // Why a generation: a path change can land while an earlier read is still pending.
  let generation = 0
  const apply = async (): Promise<void> => {
    const current = ++generation
    const path = store.getSettings().agentStateRulesPath
    const next = (path ? await readOverride(path) : null) ?? BUNDLED_AGENT_STATE_RULES
    if (current !== generation) {
      return
    }
    const previous = getActiveAgentStateRules()
    activateAgentStateRules(next)
    if (previous.version !== next.version || previous.source !== next.source) {
      onActivated({ version: next.version, source: next.source })
    }
  }
  void apply()
  store.onSettingsChanged((updates) => {
    if ('agentStateRulesPath' in updates) {
      void apply()
    }
  })
}

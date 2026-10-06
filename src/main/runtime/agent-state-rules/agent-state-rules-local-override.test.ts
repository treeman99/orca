import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import { getTerminalTailSentinelMatches } from '../terminal-tail-sentinel-index'
import { detectExplicitIdleStatusFromTitle } from '../terminal-wait-detection'
import {
  activateAgentStateRules,
  BUNDLED_AGENT_STATE_RULES,
  getActiveAgentStateRules
} from './active-agent-state-rules'
import { BUNDLED_AGENT_STATE_RULE_FILES } from './agent-state-rules-catalog'
import { startAgentStateRulesLocalOverride } from './agent-state-rules-local-override'
import { showsIdleTitleAnchor } from './agent-state-title-anchors'

function overrideText(version: number): string {
  const claude = structuredClone(
    BUNDLED_AGENT_STATE_RULE_FILES.find((file) => file.id === 'claude')
  )
  return JSON.stringify({ version, engineVersion: 1, files: [claude] })
}

function settingsStore(settings: Partial<GlobalSettings>) {
  let listener: ((updates: Partial<GlobalSettings>) => void) | null = null
  return {
    getSettings: () => settings,
    onSettingsChanged: (next: (updates: Partial<GlobalSettings>) => void) => {
      listener = next
    },
    change: (updates: Partial<GlobalSettings>) => {
      Object.assign(settings, updates)
      listener?.(updates)
    }
  }
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-state-rules-override-'))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  activateAgentStateRules(BUNDLED_AGENT_STATE_RULES)
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('agent state rules without the vendor download', () => {
  it('never reaches the network, even packaged with live updates left on', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const onActivated = vi.fn()
    const store = settingsStore({ agentStateRulesLiveUpdates: true })
    startAgentStateRulesLocalOverride(store, onActivated)
    await vi.waitFor(() => expect(getActiveAgentStateRules().source).toBe('bundled'))
    store.change({ agentStateRulesLiveUpdates: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getActiveAgentStateRules()).toBe(BUNDLED_AGENT_STATE_RULES)
  })

  it('activates a local override and reports it', async () => {
    const path = join(dir, 'rules.json')
    writeFileSync(path, overrideText(9999))
    const onActivated = vi.fn()
    startAgentStateRulesLocalOverride(settingsStore({ agentStateRulesPath: path }), onActivated)
    await vi.waitFor(() => expect(getActiveAgentStateRules().source).toBe('override'))
    expect(getActiveAgentStateRules().version).toBe(9999)
    expect(onActivated).toHaveBeenCalledWith({ version: 9999, source: 'override' })
  })

  it('falls back to the bundled rules when the override is rejected or removed', async () => {
    const path = join(dir, 'rules.json')
    writeFileSync(path, overrideText(9999))
    const store = settingsStore({ agentStateRulesPath: path })
    startAgentStateRulesLocalOverride(store, vi.fn())
    await vi.waitFor(() => expect(getActiveAgentStateRules().source).toBe('override'))

    writeFileSync(path, '{"not":"a bundle"}')
    store.change({ agentStateRulesPath: path })
    await vi.waitFor(() => expect(getActiveAgentStateRules().source).toBe('bundled'))

    store.change({ agentStateRulesPath: null })
    await vi.waitFor(() => expect(getActiveAgentStateRules()).toBe(BUNDLED_AGENT_STATE_RULES))
  })
})

// Moved from upstream's agent-state-rules-live-update.test.ts, which the fork deleted with the file.
describe('agent state rules hot reload', () => {
  it('recompiles the title anchors every pane reads, past the title memo', () => {
    expect(showsIdleTitleAnchor('✳ Claude Code')).toBe(true)
    expect(detectExplicitIdleStatusFromTitle('✳ Claude Code')).toBe('idle')
    activateAgentStateRules({
      ...BUNDLED_AGENT_STATE_RULES,
      files: BUNDLED_AGENT_STATE_RULES.files.map((file) =>
        file.id === 'claude' ? { ...file, anchors: [] } : file
      )
    })
    expect(showsIdleTitleAnchor('✳ Claude Code')).toBe(false)
    expect(detectExplicitIdleStatusFromTitle('✳ Claude Code')).toBeNull()
  })

  it('rescans a tail the sentinel index already covered when a blocked anchor arrives', () => {
    const lines = ['zebra crossing prompt']
    expect(getTerminalTailSentinelMatches(lines)).toEqual([])
    activateAgentStateRules({
      ...BUNDLED_AGENT_STATE_RULES,
      files: BUNDLED_AGENT_STATE_RULES.files.map((file) =>
        file.id === 'claude'
          ? {
              ...file,
              anchors: [
                ...file.anchors,
                {
                  id: 'zebra',
                  why: 'test',
                  when: { region: 'text', find: { lastOf: 'zebra crossing' } },
                  answer: { state: 'blocked', reason: 'agent-approval-prompt' }
                }
              ]
            }
          : file
      )
    })
    expect(getTerminalTailSentinelMatches(lines)).toEqual([0])
  })
})

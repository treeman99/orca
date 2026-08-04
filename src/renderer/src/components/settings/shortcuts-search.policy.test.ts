// The rendered shortcut rows and the Shortcuts search index read the same
// KEYBINDING_DEFINITIONS table, and only the rows were filtered — so a locked-down
// machine still matched "emulator" in Settings search, and palette-results.ts folded
// "New mobile emulator tab" into the section's Cmd+J keywords for a row that is gone.

import { describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'

const policyState = vi.hoisted(() => ({
  disableMobileEmulator: false,
  disableVoice: false,
  allowedAgents: null as readonly string[] | null
}))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  getEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView,
  useEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView
}))

const { getShortcutsPaneSearchEntries } = await import('./shortcuts-search')
const { groupDefinitions } = await import('./shortcut-groups')
const { matchesSettingsSearch } = await import('./settings-search')

const EMULATOR_SHORTCUT_TITLE = 'New mobile emulator tab'

function withPolicy<T>(overrides: Partial<typeof policyState>, run: () => T): T {
  Object.assign(policyState, overrides)
  try {
    return run()
  } finally {
    Object.assign(policyState, { disableMobileEmulator: false, disableVoice: false })
  }
}

describe('shortcuts search index under the corporate policy', () => {
  it('indexes the emulator chord when no policy is in force', () => {
    const titles = getShortcutsPaneSearchEntries().map((entry) => entry.title)
    expect(titles).toContain(EMULATOR_SHORTCUT_TITLE)
  })

  it('drops the emulator chord from the index under disableMobileEmulator', () => {
    const titles = withPolicy({ disableMobileEmulator: true }, () =>
      getShortcutsPaneSearchEntries().map((entry) => entry.title)
    )
    expect(titles).not.toContain(EMULATOR_SHORTCUT_TITLE)
  })

  it('stops matching "emulator" and "simulator" in the index under the policy', () => {
    const entries = withPolicy({ disableMobileEmulator: true }, getShortcutsPaneSearchEntries)
    expect(matchesSettingsSearch('emulator', entries)).toBe(false)
    expect(matchesSettingsSearch('simulator', entries)).toBe(false)
  })

  // The rows were already filtered; this proves the two consumers now agree.
  it('keeps the rendered rows and the index in step', () => {
    const rowTitles = withPolicy({ disableMobileEmulator: true }, () =>
      groupDefinitions([]).flatMap((group) => group.items.map((item) => item.title))
    )
    expect(rowTitles).not.toContain(EMULATOR_SHORTCUT_TITLE)
  })

  it('leaves unrelated chords indexed under the policy', () => {
    const entries = withPolicy({ disableMobileEmulator: true }, getShortcutsPaneSearchEntries)
    expect(matchesSettingsSearch('new terminal', entries)).toBe(true)
  })
})

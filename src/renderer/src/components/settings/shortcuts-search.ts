import { KEYBINDING_DEFINITIONS, type KeybindingActionId } from '../../../../shared/keybindings'
import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { policyHiddenShortcutActionIds } from './shortcut-groups'

export const getTerminalShortcutPolicySearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate(
      'auto.components.settings.shortcuts.search.f052906167',
      'Shortcuts in Terminal'
    ),
    description: translate(
      'auto.components.settings.shortcuts.search.ebd7d81e1d',
      'Choose whether Orca or the focused terminal wins when shortcuts overlap.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.ca6a0c2df7', 'shortcut'),
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.0ecba9aa5f', 'keyboard'),
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.7e3fc707aa', 'terminal'),
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.7f1b38f59a', 'tui'),
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.f1adebbe8c', 'shell'),
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.0f8cb15582', 'agent'),
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.0ecfc47434', 'conflict'),
      ...translateSearchKeyword(
        'auto.components.settings.shortcuts.search.afda131738',
        'orca first'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.shortcuts.search.4811a8264a',
        'terminal first'
      )
    ]
  })
)

// Paired with the action id so the policy filter below can drop a chord by identity; a
// title match would be one duplicated string away from removing the wrong row.
const getShortcutSearchEntriesByAction = createLocalizedCatalog(
  (): { id: KeybindingActionId | null; entry: SettingsSearchEntry }[] => [
    ...KEYBINDING_DEFINITIONS.map((item) => ({
      id: item.id,
      entry: {
        title: item.title,
        description: translate(
          'auto.components.settings.shortcuts.search.groupShortcut',
          '{{value0}} shortcut',
          { value0: item.group }
        ),
        keywords: [...item.searchKeywords]
      }
    })),
    { id: null, entry: getTerminalShortcutPolicySearchEntry() }
  ]
)

/**
 * The Shortcuts pane's search index, minus the chords the corporate policy removed.
 *
 * shortcut-groups.ts already drops those definitions from the rendered rows, but both
 * consumers read the same KEYBINDING_DEFINITIONS table and only one was filtered — so
 * "emulator" still matched the Shortcuts pane, and palette-results.ts folded
 * "New mobile emulator tab" into the section's Cmd+J keywords for a row that is gone.
 *
 * The policy read stays outside the locale memo: createLocalizedCatalog caches on first
 * call, and a policy frozen there is a gate that passes its tests and hides nothing.
 */
export function getShortcutsPaneSearchEntries(): SettingsSearchEntry[] {
  const hidden = policyHiddenShortcutActionIds()
  return getShortcutSearchEntriesByAction()
    .filter(({ id }) => id === null || !hidden.has(id))
    .map(({ entry }) => entry)
}

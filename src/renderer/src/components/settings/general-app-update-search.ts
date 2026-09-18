import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translateSearchKeyword } from './settings-search-keywords'

// One builder feeds both the pane's search gate and the row it renders. Letting them
// drift is what leaves a section header standing over nothing when a query matches the
// catalog entry but not the row.
function buildGeneralAppUpdateSearchEntry(): SettingsSearchEntry {
  return {
    title: translate('auto.components.settings.general.search.appUpdate', 'Update check'),
    description: translate(
      'auto.components.settings.general.search.appUpdateDescription',
      'Check the company release page for a newer Orca build, and see which host and repository it reads.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.general.search.update', 'update'),
      ...translateSearchKeyword(
        'auto.components.settings.general.search.checkForUpdates',
        'check for updates'
      ),
      ...translateSearchKeyword('auto.components.settings.general.search.version', 'version'),
      ...translateSearchKeyword('auto.components.settings.general.search.release', 'release'),
      ...translateSearchKeyword('auto.components.settings.general.search.upgrade', 'upgrade'),
      ...translateSearchKeyword('auto.components.settings.general.search.newBuild', 'new build'),
      ...translateSearchKeyword('auto.components.settings.general.search.ghesUpdate', 'ghes', {
        englishOnly: true
      })
    ]
  }
}

export const getGeneralAppUpdateSearchEntries = createLocalizedCatalog(() => [
  buildGeneralAppUpdateSearchEntry()
])

/** The same entry, for the row that renders it. */
export const getGeneralAppUpdateSearchEntry = createLocalizedCatalog(
  buildGeneralAppUpdateSearchEntry
)

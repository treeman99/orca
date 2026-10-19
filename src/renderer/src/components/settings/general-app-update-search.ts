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

function buildCorporateSkillBundleSearchEntry(): SettingsSearchEntry {
  return {
    title: translate('auto.components.settings.general.search.skillBundle', 'Company skill bundle'),
    description: translate(
      'auto.components.settings.general.search.skillBundleDescription',
      'Check the company skill repository for a newer revision of orchestration and the skills it uses, and replace them all in .agents and .claude.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.general.search.skill', 'skill'),
      ...translateSearchKeyword('auto.components.settings.general.search.skills', 'skills'),
      ...translateSearchKeyword(
        'auto.components.settings.general.search.orchestration',
        'orchestration',
        { englishOnly: true }
      ),
      ...translateSearchKeyword('auto.components.settings.general.search.update', 'update')
    ]
  }
}

export const getGeneralAppUpdateSearchEntries = createLocalizedCatalog(() => [
  buildGeneralAppUpdateSearchEntry(),
  buildCorporateSkillBundleSearchEntry()
])

/** The same entry, for the row that renders it. */
export const getGeneralAppUpdateSearchEntry = createLocalizedCatalog(
  buildGeneralAppUpdateSearchEntry
)

export const getCorporateSkillBundleSearchEntry = createLocalizedCatalog(
  buildCorporateSkillBundleSearchEntry
)

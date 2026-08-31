import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getDiagnosticLogSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.diagnostic.log.search.title', 'Troubleshooting log'),
    description: translate(
      'auto.components.settings.diagnostic.log.search.description',
      'Write a local plain-text log of internal decisions while reproducing a problem.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.diagnostic.log.search.log', 'log'),
      ...translateSearchKeyword(
        'auto.components.settings.diagnostic.log.search.diagnostic',
        'diagnostic'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.diagnostic.log.search.troubleshooting',
        'troubleshooting'
      ),
      ...translateSearchKeyword('auto.components.settings.diagnostic.log.search.debug', 'debug'),
      ...translateSearchKeyword('auto.components.settings.diagnostic.log.search.folder', 'folder')
    ]
  }
])

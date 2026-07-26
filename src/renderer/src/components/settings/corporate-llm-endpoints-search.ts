import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getCorporateLlmEndpointsSearchEntries = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    {
      title: translate(
        'auto.components.settings.corporateLlm.search.title',
        'Self-Hosted Model Endpoints'
      ),
      description: translate(
        'auto.components.settings.corporateLlm.search.description',
        'Save your personal token for each self-hosted model endpoint your administrator provisioned.'
      ),
      keywords: [
        ...translateSearchKeyword(
          'auto.components.settings.corporateLlm.search.selfHosted',
          'self-hosted'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.corporateLlm.search.endpoint',
          'endpoint'
        ),
        ...translateSearchKeyword('auto.components.settings.corporateLlm.search.token', 'token'),
        ...translateSearchKeyword(
          'auto.components.settings.corporateLlm.search.corporate',
          'corporate'
        ),
        ...translateSearchKeyword('auto.components.settings.corporateLlm.search.policy', 'policy'),
        ...translateSearchKeyword(
          'auto.components.settings.corporateLlm.search.administrator',
          'administrator'
        )
      ]
    }
  ]
)

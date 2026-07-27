import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getAwsSsoSearchEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('auto.components.settings.awsSso.search.title', 'AWS SSO sign-in'),
    description: translate(
      'auto.components.settings.awsSso.search.description',
      'Run `aws sso login` for a profile so Claude on Bedrock has a live AWS session.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.awsSso.search.aws', 'aws'),
      ...translateSearchKeyword('auto.components.settings.awsSso.search.sso', 'sso'),
      ...translateSearchKeyword('auto.components.settings.awsSso.search.bedrock', 'bedrock'),
      ...translateSearchKeyword('auto.components.settings.awsSso.search.profile', 'profile'),
      ...translateSearchKeyword('auto.components.settings.awsSso.search.login', 'login')
    ]
  }
])

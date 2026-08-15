import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getGatewaySearchEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('auto.components.settings.gateway.search.title', 'Corporate gateway sign-in'),
    description: translate(
      'auto.components.settings.gateway.search.description',
      'Run `gateway-cli login` so the gateway issues the virtual key Claude on Bedrock uses.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.gateway.search.gateway', 'gateway'),
      ...translateSearchKeyword('auto.components.settings.gateway.search.oidc', 'oidc'),
      ...translateSearchKeyword('auto.components.settings.gateway.search.login', 'login'),
      ...translateSearchKeyword('auto.components.settings.gateway.search.bedrock', 'bedrock'),
      ...translateSearchKeyword(
        'auto.components.settings.gateway.search.virtualKey',
        'virtual key'
      ),
      ...translateSearchKeyword('auto.components.settings.gateway.search.gatewayKo', '게이트웨이')
    ],
    targetSectionId: 'accounts-gateway'
  }
])

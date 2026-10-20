// The freshness badge of a skill the corporate bundle owns: judged against the corporate
// repository, never against the copy this build ships.

import { translate } from '@/i18n/i18n'
import {
  IntegrationStatusPill,
  type IntegrationStatusTone
} from '@/components/integration-status-pill'
import type { OwnedCorporateSkillBundle } from './corporate-skill-bundle-skill-owner'

function pillContent(bundle: OwnedCorporateSkillBundle): [IntegrationStatusTone, string] {
  const checking: [IntegrationStatusTone, string] = [
    'neutral',
    translate('auto.components.appUpdate.skillBundle.panel.checking', 'Checking...')
  ]
  if (bundle.updating) {
    return [
      'neutral',
      translate('auto.components.appUpdate.skillBundle.panel.updating', 'Updating...')
    ]
  }
  if (bundle.checking) {
    return checking
  }
  switch (bundle.status.state) {
    case 'unknown':
      return checking
    case 'available':
      return [
        'attention',
        translate('auto.components.appUpdate.skillBundle.panel.updateAvailable', 'Update available')
      ]
    case 'up-to-date':
      return [
        'connected',
        translate('auto.components.appUpdate.skillBundle.panel.upToDate', 'Up to date')
      ]
    case 'unavailable':
      return [
        'attention',
        translate('auto.components.appUpdate.skillBundle.panel.checkFailed', 'Check failed')
      ]
    // Bundle copies absent from both homes; what was found is presence only.
    case 'not-installed':
    case 'disabled':
      return [
        'connected',
        translate('auto.components.appUpdate.skillBundle.panel.installed', 'Installed')
      ]
  }
}

export function CorporateSkillBundleSkillPill({
  bundle
}: {
  bundle: OwnedCorporateSkillBundle
}): React.JSX.Element {
  const [tone, label] = pillContent(bundle)
  return <IntegrationStatusPill tone={tone}>{label}</IntegrationStatusPill>
}

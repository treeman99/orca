// Fork: a skill setup panel whose skill the corporate bundle owns installs and updates through
// that lane, not through this build.
//
// The build's panel types `orca skills install --skill <name>`, which copies this build's
// package over the fleet's customized one. For a bundle-owned name the same button replaces
// every skill of the bundle from the corporate repository — the write Settings → General →
// Updates offers — so Orchestration and CLI settings stop being a way back to the stub.

import { useEffect, type ComponentType } from 'react'
import {
  CORPORATE_SKILL_BUNDLE_BRANCH,
  CORPORATE_SKILL_BUNDLE_REPOSITORY
} from '../../../../shared/corporate-skill-bundle'
import { translate } from '@/i18n/i18n'
import type { AgentSkillSetupPanelProps } from './agent-skill-setup-panel-props'
import {
  ownedCorporateSkillBundle,
  type OwnedCorporateSkillBundle
} from '../app-update/corporate-skill-bundle-skill-owner'
import {
  runCorporateSkillBundleCheck,
  useCorporateSkillBundle
} from '../app-update/corporate-skill-bundle-store'
import { updateCorporateSkillBundleWithFeedback } from '../app-update/corporate-skill-bundle-feedback'
import { describeCorporateSkillBundleStatus } from '../app-update/corporate-skill-bundle-copy'

function CorporateSkillBundlePanelHint({
  bundle
}: {
  bundle: OwnedCorporateSkillBundle
}): React.JSX.Element {
  const { status } = bundle
  const repository =
    'target' in status && status.target.host
      ? `${status.target.host}/${status.target.repository}`
      : CORPORATE_SKILL_BUNDLE_REPOSITORY
  return (
    <div className="space-y-1 text-xs leading-snug text-muted-foreground">
      <p>
        {translate(
          'auto.components.appUpdate.skillBundle.panel.scope',
          'Installs from the company skill bundle {{value0}} ({{value1}} branch), replacing all of its skills together: {{value2}}.',
          {
            value0: repository,
            value1: CORPORATE_SKILL_BUNDLE_BRANCH,
            value2: bundle.ownedNames.join(', ')
          }
        )}
      </p>
      <p role="status">{describeCorporateSkillBundleStatus(status)}</p>
    </div>
  )
}

export function withCorporateSkillBundle(
  Panel: ComponentType<AgentSkillSetupPanelProps>
): ComponentType<AgentSkillSetupPanelProps> {
  return function CorporateSkillBundleSetupPanel(props) {
    const { freshnessSkillName, onRecheck } = props
    const snapshot = useCorporateSkillBundle()
    const state = snapshot.status?.state
    // Why: the background check waits 90s after launch; a panel opened sooner asks now, so
    // the bundle can claim its names before the build's Update is the only one on screen.
    useEffect(() => {
      if (freshnessSkillName && state === 'unknown') {
        void runCorporateSkillBundleCheck()
      }
    }, [freshnessSkillName, state])

    const bundle = ownedCorporateSkillBundle(snapshot, freshnessSkillName)
    if (!bundle) {
      return <Panel {...props} />
    }
    const busyLabel = bundle.updating
      ? translate('auto.components.appUpdate.skillBundle.panel.updating', 'Updating...')
      : undefined
    return (
      <Panel
        {...props}
        installLabel={busyLabel ?? props.installLabel}
        installedInstallLabel={busyLabel ?? props.installedInstallLabel}
        installDisabled={Boolean(props.installDisabled || bundle.updating || bundle.checking)}
        onInstallClick={() => {
          void updateCorporateSkillBundleWithFeedback().then(() => onRecheck())
        }}
        onRecheck={() => Promise.all([onRecheck(), runCorporateSkillBundleCheck()])}
        actionHint={<CorporateSkillBundlePanelHint bundle={bundle} />}
      />
    )
  }
}

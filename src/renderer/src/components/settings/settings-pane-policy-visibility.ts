// Which Settings panes the corporate policy removes.
//
// The nav registry (useSettingsNavigationMetadata) already drops these entries, and that
// covers the sidebar, the settings-search index and the Cmd+J palette. It does NOT cover
// deep links: openSettingsTarget force-mounts a pane id without consulting the registry, so
// a removed pane is still reachable — and MobileEmulatorSettingsPane fires `emulator.
// availability` at simctl/adb the moment it mounts.
//
// One table rather than a check per call site: a pane added to the registry's conditionals
// and forgotten here is exactly the leak this exists to close, and a single list is what a
// reviewer can diff against the registry.

import { getEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'
import { ARTIFACT_SHARING_REMOVED } from '../../../../shared/artifact-sharing-removal'
import { SKILL_SHARING_REMOVED } from '../../../../shared/skill-sharing-removal'

const PANE_POLICY_KEYS: Readonly<Record<string, keyof EnterprisePolicyView>> = {
  stats: 'disableUsagePolling',
  'mobile-emulator': 'disableMobileEmulator',
  mobile: 'disableMobilePairing',
  voice: 'disableVoice',
  servers: 'disableRemoteOrcaServer',
  plugins: 'disablePlugins',
  // Orca Cloud sign-in and the vendor mobile relay are exactly what this pane configures,
  // and disableCloudRelay already turns both off — the pane was a dead row on a locked fleet.
  'orca-account': 'disableCloudRelay'
}

// Removed outright rather than policy-keyed, so they are not in the table above: both panes only
// configure traffic to a vendor host this build never contacts. Share Skills is the worse of the
// two — its install lane needs no sign-in, so a deep link to the pane is a live door, not a dead
// settings row.
const REMOVED_PANE_IDS: ReadonlySet<string> = new Set([
  ...(ARTIFACT_SHARING_REMOVED ? ['artifacts'] : []),
  ...(SKILL_SHARING_REMOVED ? ['share-skills'] : [])
])

export function isSettingsPaneHiddenByPolicy(
  sectionId: string,
  policy: EnterprisePolicyView = getEnterprisePolicyView()
): boolean {
  if (REMOVED_PANE_IDS.has(sectionId)) {
    return true
  }
  const key = PANE_POLICY_KEYS[sectionId]
  return key !== undefined && policy[key] === true
}

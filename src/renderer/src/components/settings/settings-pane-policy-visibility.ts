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

const PANE_POLICY_KEYS: Readonly<Record<string, keyof EnterprisePolicyView>> = {
  stats: 'disableUsagePolling',
  'mobile-emulator': 'disableMobileEmulator',
  mobile: 'disableMobilePairing',
  voice: 'disableVoice',
  servers: 'disableRemoteOrcaServer'
}

export function isSettingsPaneHiddenByPolicy(
  sectionId: string,
  policy: EnterprisePolicyView = getEnterprisePolicyView()
): boolean {
  const key = PANE_POLICY_KEYS[sectionId]
  return key !== undefined && policy[key] === true
}

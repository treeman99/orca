// Is the mobile emulator usable right now? One predicate, so no surface reads
// `settings.mobileEmulatorEnabled` raw.
//
// Why that matters: the user setting and the corporate policy both have to be consulted,
// and there are eight read sites plus a pane that two different layers mount. Leaving the
// raw property read in place is how an upstream rebase reintroduces an ungated affordance —
// the property still exists, so nothing fails to compile.
//
// The real refusal is in main (RuntimeEmulatorCommands + the two stream channels). This is
// the display half: a build with no `enterprisePolicy:get` IPC falls back to unrestricted
// and must not thereby unlock anything.

import { getEnterprisePolicyView } from '../enterprise/enterprise-policy-access'

type MobileEmulatorSettings = { mobileEmulatorEnabled?: boolean } | null | undefined

/** Safe outside React; the policy view is a plain cached value. */
export function isMobileEmulatorAvailable(settings: MobileEmulatorSettings): boolean {
  return (
    !getEnterprisePolicyView().disableMobileEmulator && settings?.mobileEmulatorEnabled !== false
  )
}

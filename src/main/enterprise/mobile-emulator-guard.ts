// `disableMobileEmulator`: the mobile emulator may not be started, attached, or driven.
//
// Wired into the RuntimeEmulatorCommands host's `getEmulatorBridge` — the one funnel
// `requireEmulatorBridge()` pulls the bridge through for every emulator RPC handler, so
// this also covers the `orca emulator` CLI, headless `orca serve`, and any method a later
// rebase adds. Kept out of orca-runtime-emulator.ts, which sits at the max-lines ceiling.

import { EmulatorError, MOBILE_EMULATOR_DISABLED_GUIDANCE } from '../emulator/emulator-errors'
import { getEnterprisePolicy } from './enterprise-policy-file'

/** Throws when the corporate policy turns the mobile emulator off. */
export function assertMobileEmulatorAllowedByPolicy(): void {
  if (getEnterprisePolicy().disableMobileEmulator) {
    throw new EmulatorError('emulator_disabled_by_policy', MOBILE_EMULATOR_DISABLED_GUIDANCE)
  }
}

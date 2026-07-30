// Why: shared error codes for emulator (mirrors BrowserErrorCode in shared/runtime-types; used by bridge, runtime, dispatcher, CLI handlers, skill examples). Keep codes stable for agents.
export class EmulatorError extends Error {
  code: EmulatorErrorCode
  constructor(code: EmulatorErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'EmulatorError'
  }
}

// A distinct code from 'emulator_disabled', which already means two other things (the user
// setting, and the refused scrcpy download) — an agent or the CLI must be able to tell
// "you turned this off" from "your administrator did".
export const MOBILE_EMULATOR_DISABLED_GUIDANCE =
  'The mobile emulator is disabled by an enterprise policy on this machine.'

export type EmulatorErrorCode =
  | 'emulator_no_active'
  | 'emulator_device_not_found'
  | 'emulator_helper_failed'
  | 'emulator_simctl_unavailable'
  | 'emulator_not_macos'
  | 'emulator_disabled'
  | 'emulator_disabled_by_policy'
  | 'emulator_unsupported'
  | 'emulator_error'

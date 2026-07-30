import { describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../shared/enterprise-policy-view'

const policyState = vi.hoisted(() => ({
  disableMobileEmulator: false,
  disableMobilePairing: false
}))

vi.mock('../enterprise/enterprise-policy-access', () => ({
  getEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView,
  useEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView
}))

import { isMobileEmulatorAvailable } from './mobile-emulator-availability'

describe('isMobileEmulatorAvailable', () => {
  it('is available by default, and when the setting is explicitly on', () => {
    policyState.disableMobileEmulator = false
    expect(isMobileEmulatorAvailable(undefined)).toBe(true)
    expect(isMobileEmulatorAvailable({})).toBe(true)
    expect(isMobileEmulatorAvailable({ mobileEmulatorEnabled: true })).toBe(true)
  })

  it('respects the user setting', () => {
    policyState.disableMobileEmulator = false
    expect(isMobileEmulatorAvailable({ mobileEmulatorEnabled: false })).toBe(false)
  })

  // The policy has to win over the setting, not merely default it: the Settings toggle that
  // writes `mobileEmulatorEnabled` lives in the pane the policy removes, so a machine that
  // turned it on before the policy landed keeps a `true` on disk forever.
  it('refuses under policy even when the user setting says on', () => {
    policyState.disableMobileEmulator = true
    expect(isMobileEmulatorAvailable({ mobileEmulatorEnabled: true })).toBe(false)
  })

  // Different features, different switches — pairing a phone is not streaming a local AVD.
  it('is unaffected by the mobile pairing switch', () => {
    policyState.disableMobileEmulator = false
    policyState.disableMobilePairing = true
    expect(isMobileEmulatorAvailable({ mobileEmulatorEnabled: true })).toBe(true)
  })
})

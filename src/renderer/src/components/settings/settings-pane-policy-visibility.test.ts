import { describe, expect, it } from 'vitest'
import { isSettingsPaneHiddenByPolicy } from './settings-pane-policy-visibility'
import { buildSettingsNavigationMetadata } from '@/hooks/useSettingsNavigationMetadata'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'
import type { Repo } from '../../../../shared/types'

const UNRESTRICTED: EnterprisePolicyView = {
  allowedAgents: null,
  lockdown: false,
  disableAutoUpdate: false,
  disableMobilePairing: false,
  disableMobileEmulator: false,
  disableExternalAutomations: false,
  disableAgentInstallSuggestions: false,
  disableUsagePolling: false,
  disableVendorProviderAccounts: false,
  disableRemoteOrcaServer: false,
  disableVoice: false,
  disablePlugins: false,
  requireComputerUseApproval: false
}

const repo = {
  id: 'repo-1',
  path: '/repo',
  displayName: 'Repo',
  badgeColor: '#000',
  addedAt: 0
} satisfies Repo

function navIds(policy: EnterprisePolicyView): string[] {
  return buildSettingsNavigationMetadata({
    isMac: true,
    isWindows: false,
    isWebClient: false,
    isDev: false,
    isLinearConnected: false,
    policy,
    repos: [repo]
  }).map((section) => section.id)
}

describe('isSettingsPaneHiddenByPolicy', () => {
  it('hides nothing without a policy', () => {
    for (const pane of [
      'stats',
      'mobile-emulator',
      'mobile',
      'voice',
      'servers',
      'plugins',
      'agents'
    ]) {
      expect(isSettingsPaneHiddenByPolicy(pane, UNRESTRICTED), pane).toBe(false)
    }
  })

  it('hides Stats & Usage when the policy refuses to fetch what it displays', () => {
    expect(
      isSettingsPaneHiddenByPolicy('stats', { ...UNRESTRICTED, disableUsagePolling: true })
    ).toBe(true)
  })

  it('hides the Mobile Emulator pane on its own switch, not the pairing one', () => {
    const emulatorOff = { ...UNRESTRICTED, disableMobileEmulator: true }
    expect(isSettingsPaneHiddenByPolicy('mobile-emulator', emulatorOff)).toBe(true)
    expect(isSettingsPaneHiddenByPolicy('mobile', emulatorOff)).toBe(false)

    const pairingOff = { ...UNRESTRICTED, disableMobilePairing: true }
    expect(isSettingsPaneHiddenByPolicy('mobile', pairingOff)).toBe(true)
    expect(isSettingsPaneHiddenByPolicy('mobile-emulator', pairingOff)).toBe(false)
  })

  it('never hides a pane it has no rule for', () => {
    expect(isSettingsPaneHiddenByPolicy('agents', { ...UNRESTRICTED, lockdown: true })).toBe(false)
  })
})

// The registry and this table must agree, or a deep link reaches a pane the sidebar removed
// (the bypass: the deep-link effect force-mounts a pane id without consulting the registry).
describe('deep-link guard agrees with the settings nav registry', () => {
  it.each([
    ['stats', { disableUsagePolling: true }],
    ['mobile-emulator', { disableMobileEmulator: true }],
    ['mobile', { disableMobilePairing: true }],
    ['voice', { disableVoice: true }],
    ['servers', { disableRemoteOrcaServer: true }],
    ['plugins', { disablePlugins: true }]
  ] as const)('drops %s from the registry and refuses the deep link', (pane, overrides) => {
    const policy = { ...UNRESTRICTED, ...overrides }
    expect(navIds(UNRESTRICTED)).toContain(pane)
    expect(navIds(policy)).not.toContain(pane)
    expect(isSettingsPaneHiddenByPolicy(pane, policy)).toBe(true)
  })
})

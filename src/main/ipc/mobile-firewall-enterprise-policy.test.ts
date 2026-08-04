// `mobile:repairWindowsFirewall` raises a UAC prompt and adds an inbound rule named
// "Orca Mobile Pairing". Its only caller is WindowsFirewallNotice inside the Mobile pane,
// so under `disableMobilePairing` there is no surface for it — but the channel stayed
// registered, and a channel that survives its UI is what a rebase reconnects by accident.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const { handleMock, networkInterfacesMock, getEnterprisePolicyMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  networkInterfacesMock: vi.fn(),
  getEnterprisePolicyMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: { isPackaged: false },
  ipcMain: { handle: handleMock },
  shell: { openExternal: vi.fn() }
}))

vi.mock('os', () => ({ networkInterfaces: networkInterfacesMock }))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

import { registerMobileHandlers } from './mobile'

const FIREWALL_CHANNELS = [
  'mobile:getWindowsFirewallStatus',
  'mobile:repairWindowsFirewall',
  'mobile:openWindowsNetworkSettings'
]

function registerAndCollectChannels(): Set<string> {
  const channels = new Set<string>()
  handleMock.mockImplementation((channel: string) => {
    channels.add(channel)
  })
  registerMobileHandlers({} as never)
  return channels
}

describe('mobile Windows-firewall channels under the enterprise policy', () => {
  beforeEach(() => {
    handleMock.mockReset()
    networkInterfacesMock.mockReset()
    networkInterfacesMock.mockReturnValue({})
    getEnterprisePolicyMock.mockReset()
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
  })

  it('registers the firewall channels when no policy is in force', () => {
    const channels = registerAndCollectChannels()

    for (const channel of FIREWALL_CHANNELS) {
      expect(channels.has(channel)).toBe(true)
    }
  })

  it('does not register them under disableMobilePairing', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    const channels = registerAndCollectChannels()

    for (const channel of FIREWALL_CHANNELS) {
      expect(channels.has(channel)).toBe(false)
    }
  })

  // The lockdown must not cost the rest of the mobile IPC surface: revoking an
  // already-paired phone is the one mobile action an administrator still wants.
  it('keeps the device-revocation channels registered under lockdown', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    const channels = registerAndCollectChannels()

    expect(channels.has('mobile:listDevices')).toBe(true)
    expect(channels.has('mobile:revokeDevice')).toBe(true)
  })

  it('leaves the firewall channels alone when only the emulator is disabled', () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy({ disableMobileEmulator: true }))

    const channels = registerAndCollectChannels()

    for (const channel of FIREWALL_CHANNELS) {
      expect(channels.has(channel)).toBe(true)
    }
  })
})

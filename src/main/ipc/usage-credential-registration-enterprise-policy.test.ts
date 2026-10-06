import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { VENDOR_ACCOUNTS_DISABLED_BY_POLICY } from '../enterprise/vendor-account-registration-guard'

const ipcState = vi.hoisted(() => ({
  handleHandlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      ipcState.handleHandlers.set(channel, handler)
    }
  }
}))

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

const saveZcodePlanApiKeyMock = vi.hoisted(() => vi.fn())
const saveOpenCodeGoApiKeyMock = vi.hoisted(() => vi.fn())

vi.mock('../zcode/zcode-plan-api-key-store', () => ({
  saveZcodePlanApiKey: saveZcodePlanApiKeyMock,
  clearZcodePlanApiKey: vi.fn(),
  hasZcodePlanApiKey: vi.fn(() => false),
  getZcodePlanApiKeyProtection: vi.fn(() => null)
}))
vi.mock('../rate-limits/zcode-usage-fetcher', () => ({
  hasZcodeCliPlanCredentials: vi.fn(() => false)
}))
vi.mock('../opencode/opencode-go-api-key-store', () => ({
  saveOpenCodeGoApiKey: saveOpenCodeGoApiKeyMock,
  clearOpenCodeGoApiKey: vi.fn(),
  hasOpenCodeGoApiKey: vi.fn(() => false)
}))

import { registerOpenCodeGoCredentialsHandlers } from './opencode-go-credentials'
import { registerZcodePlanCredentialsHandlers } from './zcode-plan-credentials'

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = ipcState.handleHandlers.get(channel)
  if (!handler) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return await handler({}, ...args)
}

// v1.4.221 added two usage-credential stores beside MiniMax's: a GLM Coding Plan key (Z.AI /
// Zhipu) and an OpenCode Go key. Saving either is vendor-account registration, like MiniMax.
describe('usage credential registration under the enterprise policy', () => {
  beforeEach(() => {
    ipcState.handleHandlers.clear()
    saveZcodePlanApiKeyMock.mockReset()
    saveOpenCodeGoApiKeyMock.mockReset()
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
    registerZcodePlanCredentialsHandlers(null)
    registerOpenCodeGoCredentialsHandlers(null)
  })

  it.each([
    ['zcodePlanCredentials:saveApiKey', saveZcodePlanApiKeyMock],
    ['opencodeGoCredentials:saveApiKey', saveOpenCodeGoApiKeyMock]
  ])('refuses %s under lockdown without writing the key', async (channel, store) => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    await expect(invoke(channel, 'key-value')).rejects.toThrow(VENDOR_ACCOUNTS_DISABLED_BY_POLICY)
    expect(store).not.toHaveBeenCalled()
  })

  it.each([
    ['zcodePlanCredentials:saveApiKey', saveZcodePlanApiKeyMock],
    ['opencodeGoCredentials:saveApiKey', saveOpenCodeGoApiKeyMock]
  ])('lets %s through when no policy locks the machine down', async (channel, store) => {
    await invoke(channel, 'key-value')

    expect(store).toHaveBeenCalledWith('key-value')
  })
})

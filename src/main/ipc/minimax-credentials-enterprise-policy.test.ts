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

const saveMiniMaxSessionCookieMock = vi.hoisted(() => vi.fn())
const saveMiniMaxApiKeyMock = vi.hoisted(() => vi.fn())

vi.mock('../minimax/minimax-cookie-store', () => ({
  saveMiniMaxSessionCookie: saveMiniMaxSessionCookieMock,
  clearMiniMaxSessionCookie: vi.fn(),
  hasMiniMaxSessionCookie: vi.fn(() => false)
}))

vi.mock('../minimax/minimax-api-key-store', () => ({
  saveMiniMaxApiKey: saveMiniMaxApiKeyMock,
  clearMiniMaxApiKey: vi.fn(),
  hasMiniMaxApiKey: vi.fn(() => false)
}))

vi.mock('../rate-limits/minimax/minimax-request-context', () => ({
  clearMiniMaxSessionCookieJar: vi.fn(() => Promise.resolve())
}))

import { registerMiniMaxCredentialsHandlers } from './minimax-credentials'

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = ipcState.handleHandlers.get(channel)
  if (!handler) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return await handler({}, ...args)
}

// v1.4.199 added an API-key credential beside the session cookie. Both are vendor-account
// registration, so a lockdown that refuses one and accepts the other refuses nothing.
describe('MiniMax credential registration under the enterprise policy', () => {
  beforeEach(() => {
    ipcState.handleHandlers.clear()
    saveMiniMaxSessionCookieMock.mockReset()
    saveMiniMaxApiKeyMock.mockReset()
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
    registerMiniMaxCredentialsHandlers(null)
  })

  it.each([
    ['minimaxCredentials:saveCookie', 'cookie-value', saveMiniMaxSessionCookieMock],
    ['minimaxCredentials:saveApiKey', 'key-value', saveMiniMaxApiKeyMock]
  ])('refuses %s under lockdown without writing the credential', async (channel, value, store) => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    await expect(invoke(channel, value)).rejects.toThrow(VENDOR_ACCOUNTS_DISABLED_BY_POLICY)
    expect(store).not.toHaveBeenCalled()
  })

  it.each([
    ['minimaxCredentials:saveCookie', 'cookie-value', saveMiniMaxSessionCookieMock],
    ['minimaxCredentials:saveApiKey', 'key-value', saveMiniMaxApiKeyMock]
  ])('lets %s through when no policy locks the machine down', async (channel, value, store) => {
    await invoke(channel, value)

    expect(store).toHaveBeenCalledWith(value)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const ipcState = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      ipcState.handlers.set(channel, handler)
    }
  }
}))

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

const minimaxStore = vi.hoisted(() => ({
  saveMiniMaxSessionCookie: vi.fn(),
  clearMiniMaxSessionCookie: vi.fn(),
  hasMiniMaxSessionCookie: vi.fn(() => false)
}))
vi.mock('../minimax/minimax-cookie-store', () => minimaxStore)
vi.mock('../rate-limits/minimax-request-context', () => ({
  clearMiniMaxSessionCookieJar: vi.fn(async () => {})
}))

import { registerClaudeAccountHandlers } from './claude-accounts'
import { registerCodexAccountHandlers } from './codex-accounts'
import { registerMiniMaxCredentialsHandlers } from './minimax-credentials'
import { VENDOR_ACCOUNTS_DISABLED_BY_POLICY } from '../enterprise/vendor-account-registration-guard'

function invoke(channel: string, ...args: unknown[]): unknown {
  const handler = ipcState.handlers.get(channel)
  if (!handler) {
    throw new Error(`${channel} was not registered`)
  }
  return handler({}, ...args)
}

function makeAccountService(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    listAccounts: vi.fn(() => []),
    addAccount: vi.fn(),
    cancelPendingLogin: vi.fn(),
    reauthenticateAccount: vi.fn(),
    removeAccount: vi.fn(),
    selectAccount: vi.fn(),
    selectAccountForTarget: vi.fn()
  }
}

describe('vendor AI account registration under the enterprise policy', () => {
  let claude: ReturnType<typeof makeAccountService>
  let codex: ReturnType<typeof makeAccountService>

  beforeEach(() => {
    ipcState.handlers.clear()
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
    minimaxStore.saveMiniMaxSessionCookie.mockReset()
    claude = makeAccountService()
    codex = makeAccountService()
    registerClaudeAccountHandlers(claude as never)
    registerCodexAccountHandlers(codex as never)
    registerMiniMaxCredentialsHandlers(null)
  })

  describe('when the policy disables vendor accounts', () => {
    beforeEach(() => {
      getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    })

    it('refuses to add a Claude subscription account', () => {
      expect(() => invoke('claudeAccounts:add')).toThrow(VENDOR_ACCOUNTS_DISABLED_BY_POLICY)
      expect(claude.addAccount).not.toHaveBeenCalled()
    })

    it('refuses to re-authenticate a Claude account', () => {
      expect(() => invoke('claudeAccounts:reauthenticate', { accountId: 'a' })).toThrow(
        VENDOR_ACCOUNTS_DISABLED_BY_POLICY
      )
      expect(claude.reauthenticateAccount).not.toHaveBeenCalled()
    })

    it('refuses to add or re-authenticate a Codex account', () => {
      expect(() => invoke('codexAccounts:add')).toThrow(VENDOR_ACCOUNTS_DISABLED_BY_POLICY)
      expect(() => invoke('codexAccounts:reauthenticate', { accountId: 'a' })).toThrow(
        VENDOR_ACCOUNTS_DISABLED_BY_POLICY
      )
    })

    it('refuses to store a MiniMax session cookie', () => {
      expect(() => invoke('minimaxCredentials:saveCookie', 'cookie')).toThrow(
        VENDOR_ACCOUNTS_DISABLED_BY_POLICY
      )
      expect(minimaxStore.saveMiniMaxSessionCookie).not.toHaveBeenCalled()
    })

    // The other half of the contract: a user must still be able to clear a credential
    // the policy now rejects, or a machine stays stuck with it.
    it('still lists, selects, and removes what is already stored', () => {
      expect(() => invoke('claudeAccounts:list')).not.toThrow()
      expect(() => invoke('claudeAccounts:remove', { accountId: 'a' })).not.toThrow()
      expect(() => invoke('claudeAccounts:select', { accountId: null })).not.toThrow()
      expect(() => invoke('codexAccounts:remove', { accountId: 'a' })).not.toThrow()
      expect(claude.removeAccount).toHaveBeenCalledWith('a')
    })
  })

  it('leaves registration alone when no policy applies', () => {
    invoke('claudeAccounts:add')
    invoke('codexAccounts:add')
    invoke('minimaxCredentials:saveCookie', 'cookie')

    expect(claude.addAccount).toHaveBeenCalled()
    expect(codex.addAccount).toHaveBeenCalled()
    expect(minimaxStore.saveMiniMaxSessionCookie).toHaveBeenCalledWith('cookie')
  })

  // `allowedAgents` restricts which CLI may run; it is not a credential rule, and a
  // Bedrock fleet needs `claude` the binary while forbidding the platform.claude.com login.
  it('is independent of the agent allowlist', () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy({ allowedAgents: ['claude'] }))
    invoke('claudeAccounts:add')
    expect(claude.addAccount).toHaveBeenCalled()
  })
})

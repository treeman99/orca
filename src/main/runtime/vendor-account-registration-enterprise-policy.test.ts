import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { VENDOR_ACCOUNTS_DISABLED_BY_POLICY } from '../enterprise/vendor-account-registration-guard'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

vi.mock('../git/worktree', () => ({
  listWorktrees: vi.fn().mockResolvedValue([]),
  listWorktreesStrict: vi.fn().mockResolvedValue([])
}))

const getAntigravityAccountServiceMock = vi.hoisted(() => vi.fn())
vi.mock('../antigravity/native-account-host', () => ({
  getAntigravityAccountService: getAntigravityAccountServiceMock
}))

import { OrcaRuntimeService } from './orca-runtime'
import { eraseRpcMethods, isStreamingMethod } from './rpc/core'
import { RuntimeAccountController } from './runtime-account-controller'

// v1.4.163 opened `orca account add` so the CLI can register a vendor account on a headless
// host, and v1.4.226 replaced its Claude half with a sign-in RPC (`claude auth login`). Those
// lanes never pass the ipcMain handlers, so the gate lives on the controller methods they share.
const REGISTRATION_CALLS = [
  ['beginClaudeSignIn', (accounts: RuntimeAccountController) => accounts.beginClaudeSignIn({})],
  [
    'finishClaudeSignIn',
    (accounts: RuntimeAccountController) => accounts.finishClaudeSignIn({ accountId: 'account-1' })
  ],
  [
    'addCodexFromHome',
    (accounts: RuntimeAccountController) => accounts.addCodexFromHome('/tmp/codex-login')
  ]
] as const

describe('vendor account registration under the enterprise policy', () => {
  beforeEach(() => {
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
  })

  it.each(REGISTRATION_CALLS)('refuses %s when the policy disables vendor accounts', (_, call) => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    expect(() => call(new RuntimeAccountController())).toThrow(VENDOR_ACCOUNTS_DISABLED_BY_POLICY)
  })

  it.each(REGISTRATION_CALLS)('lets an explicit opt-back-in reach %s', (_, call) => {
    getEnterprisePolicyMock.mockReturnValue(
      makeLockdownPolicy({ disableVendorProviderAccounts: false })
    )

    // Why not a success assertion: account services are not wired up in this harness, so
    // getting past the gate surfaces as requireServices() failing instead.
    expect(() => call(new RuntimeAccountController())).toThrow(
      /Account services are not configured/
    )
  })
})

// v1.4.221 opened two more registration lanes on the runtime: `orca account add --agent
// opencode|devin` (managed data accounts) and saving the current Antigravity credential.
describe('v1.4.221 vendor account registration lanes under the enterprise policy', () => {
  beforeEach(() => {
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
  })

  it('refuses addDataAccountFromHome when the policy disables vendor accounts', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    const runtime = new OrcaRuntimeService()

    expect(() => runtime.addDataAccountFromHome('opencode', '/tmp/opencode-login', 'work')).toThrow(
      VENDOR_ACCOUNTS_DISABLED_BY_POLICY
    )
  })

  it('refuses accounts.antigravityAddCurrent before touching the credential store', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    const { ANTIGRAVITY_ACCOUNT_METHODS } = await import('./rpc/methods/antigravity-accounts')
    const addCurrent = eraseRpcMethods(ANTIGRAVITY_ACCOUNT_METHODS).find(
      (method) => method.name === 'accounts.antigravityAddCurrent'
    )
    if (!addCurrent || isStreamingMethod(addCurrent)) {
      throw new Error('accounts.antigravityAddCurrent must be a request method')
    }

    await expect(
      addCurrent.handler({ runtime: 'host' }, { runtime: new OrcaRuntimeService() })
    ).rejects.toThrow(VENDOR_ACCOUNTS_DISABLED_BY_POLICY)
    expect(getAntigravityAccountServiceMock).not.toHaveBeenCalled()
  })
})

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

// v1.4.163 opened `accounts.addClaudeFromConfigDir` / `accounts.addCodexFromHome` so the
// `orca account add` CLI can register a vendor account on a headless host. That lane never
// passes the ipcMain handlers `assertVendorAccountRegistrationAllowed()` used to sit on, so
// the gate lives on the runtime methods both lanes share.
describe('vendor account registration under the enterprise policy', () => {
  beforeEach(() => {
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
  })

  it.each([
    ['addClaudeAccountFromConfigDir', '/tmp/claude-login'],
    ['addCodexAccountFromHome', '/tmp/codex-login']
  ] as const)('refuses %s when the policy disables vendor accounts', (name, source) => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    const runtime = new OrcaRuntimeService()

    expect(() => runtime[name](source)).toThrow(VENDOR_ACCOUNTS_DISABLED_BY_POLICY)
  })

  it.each([
    ['addClaudeAccountFromConfigDir', '/tmp/claude-login'],
    ['addCodexAccountFromHome', '/tmp/codex-login']
  ] as const)('lets an explicit opt-back-in reach %s', (name, source) => {
    getEnterprisePolicyMock.mockReturnValue(
      makeLockdownPolicy({ disableVendorProviderAccounts: false })
    )
    const runtime = new OrcaRuntimeService()

    // Why not a success assertion: account services are not wired up in this harness, so
    // getting past the gate surfaces as requireAccountServices() failing instead.
    expect(() => runtime[name](source)).toThrow(/Account services are not configured/)
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

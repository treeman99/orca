import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../enterprise/enterprise-policy-fixture'
import { VENDOR_ACCOUNTS_DISABLED_BY_POLICY } from '../enterprise/vendor-account-registration-guard'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

vi.mock('../git/worktree', () => ({
  listWorktrees: vi.fn().mockResolvedValue([]),
  listWorktreesStrict: vi.fn().mockResolvedValue([])
}))

import { OrcaRuntimeService } from './orca-runtime'

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

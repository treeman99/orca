import { describe, expect, it, vi } from 'vitest'

vi.mock('./ManagedDataAccountsSection', () => ({
  ManagedDataAccountsSection: () => null
}))

import {
  isAccountSectionAllowedByPolicy,
  PolicyGatedManagedDataAccountsSection
} from './accounts-pane-enterprise-policy'

const OPEN = { allowedAgents: null, disableVendorProviderAccounts: false }
const NO_VENDOR_ACCOUNTS = { allowedAgents: null, disableVendorProviderAccounts: true }
const CLAUDE_ONLY = { allowedAgents: ['claude'], disableVendorProviderAccounts: false }

const target = { kind: 'local' } as const

function section(key: string): React.JSX.Element {
  return <div key={key} />
}

// Upstream keys this block by runtime environment id, so only its children identify it.
function managedDataBlock(): React.JSX.Element {
  return (
    <div key="local">
      <PolicyGatedManagedDataAccountsSection provider="opencode" target={target} />
      <PolicyGatedManagedDataAccountsSection provider="devin" target={target} />
    </div>
  )
}

describe('Accounts pane sections under the enterprise policy', () => {
  it.each(['zcode', 'antigravity:local:host:', 'cursor', 'claude-accounts'])(
    'hides the %s vendor section when vendor accounts are disabled',
    (key) => {
      expect(isAccountSectionAllowedByPolicy(section(key), OPEN)).toBe(true)
      expect(isAccountSectionAllowedByPolicy(section(key), NO_VENDOR_ACCOUNTS)).toBe(false)
    }
  )

  it('hides v1.4.221 vendor sections for agents the allowlist leaves out', () => {
    expect(isAccountSectionAllowedByPolicy(section('zcode'), CLAUDE_ONLY)).toBe(false)
    expect(
      isAccountSectionAllowedByPolicy(section('antigravity:env-1:wsl:Ubuntu'), CLAUDE_ONLY)
    ).toBe(false)
    expect(isAccountSectionAllowedByPolicy(section('claude-accounts'), CLAUDE_ONLY)).toBe(true)
  })

  it('hides the managed-data block only when neither opencode nor devin is allowed', () => {
    expect(isAccountSectionAllowedByPolicy(managedDataBlock(), OPEN)).toBe(true)
    expect(isAccountSectionAllowedByPolicy(managedDataBlock(), NO_VENDOR_ACCOUNTS)).toBe(false)
    expect(isAccountSectionAllowedByPolicy(managedDataBlock(), CLAUDE_ONLY)).toBe(false)
    expect(
      isAccountSectionAllowedByPolicy(managedDataBlock(), {
        allowedAgents: ['devin'],
        disableVendorProviderAccounts: false
      })
    ).toBe(true)
  })

  it('keeps the account-location and corporate gateway sections under any policy', () => {
    expect(isAccountSectionAllowedByPolicy(section('gateway'), NO_VENDOR_ACCOUNTS)).toBe(true)
    expect(isAccountSectionAllowedByPolicy(section('location'), CLAUDE_ONLY)).toBe(true)
    expect(isAccountSectionAllowedByPolicy(null, NO_VENDOR_ACCOUNTS)).toBe(true)
  })
})

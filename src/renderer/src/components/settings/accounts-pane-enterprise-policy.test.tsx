import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  policy: { allowedAgents: null as string[] | null, disableVendorProviderAccounts: false }
}))

vi.mock('./ManagedDataAccountsSection', () => ({
  ManagedDataAccountsSection: () => null
}))
vi.mock('./SettingsSectionStack', () => ({
  SettingsSectionStack: ({ sections }: { sections: React.ReactNode[] }) => <>{sections}</>
}))
vi.mock('./GatewaySection', () => ({ GatewaySection: () => <i data-section="gateway" /> }))
vi.mock('@/enterprise/enterprise-policy-access', () => ({
  useEnterprisePolicyView: () => mocks.policy
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { settingsSearchQuery: string }) => unknown) =>
    selector({ settingsSearchQuery: '' })
}))

import {
  isAccountSectionAllowedByPolicy,
  PolicyGatedManagedDataAccountsSection,
  SettingsSectionStack
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

// AccountsPane renders through this stand-in, so it is where the filter actually runs.
describe('the Accounts pane section stack under the enterprise policy', () => {
  function rendered(): string {
    return renderToStaticMarkup(
      <SettingsSectionStack
        sections={[<b key="claude-accounts" data-section="claude" />, <b key="location" />]}
        spacing="group"
      />
    )
  }

  it('drops vendor sections and keeps the gateway login when vendor accounts are disabled', () => {
    mocks.policy = NO_VENDOR_ACCOUNTS
    expect(rendered()).not.toContain('data-section="claude"')
    expect(rendered()).toContain('data-section="gateway"')
  })

  it('keeps every section when the policy allows vendor accounts', () => {
    mocks.policy = OPEN
    expect(rendered()).toContain('data-section="claude"')
    expect(rendered()).toContain('data-section="gateway"')
  })
})

import { getEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'
import { getAccountsLocationSearchEntries, getAccountsPaneSearchEntries } from './accounts-search'
import { getGatewaySearchEntries } from './gateway-search'
import type { SettingsSearchEntry } from './settings-search'

/**
 * Cmd+J must not surface a vendor row the pane no longer renders. AWS SSO and the corporate
 * endpoints stay — they are the fleet's supported path, not vendor accounts. Upstream's list
 * carries every vendor row (v1.4.221 added Antigravity and the GLM Coding Plan), so under the
 * policy only its account-location rows survive.
 */
export function getAccountsPaneSearchEntriesUnderPolicy(): SettingsSearchEntry[] {
  const accounts = getEnterprisePolicyView().disableVendorProviderAccounts
    ? getAccountsLocationSearchEntries()
    : getAccountsPaneSearchEntries()
  return [...accounts, ...getGatewaySearchEntries()]
}

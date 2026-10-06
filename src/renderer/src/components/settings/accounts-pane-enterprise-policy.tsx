import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react'
import { isAgentAllowedByPolicy } from '../../../../shared/corporate-agent-access'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'
import { useEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'
import { ManagedDataAccountsSection } from './ManagedDataAccountsSection'

type VendorAccountPolicy = Pick<
  EnterprisePolicyView,
  'allowedAgents' | 'disableVendorProviderAccounts'
>

// Section key (before any `:<runtime target>` suffix) → the agents whose vendor accounts it
// manages. Unlisted keys (location, gateway) are the fleet's supported path, not vendor accounts.
// MiniMax has no TuiAgent id, so an id no allowlist contains hides it under any Bedrock-only policy.
const ACCOUNT_SECTION_AGENTS_BY_KEY: Record<string, readonly string[]> = {
  'claude-accounts': ['claude'],
  'codex-accounts': ['codex'],
  gemini: ['gemini'],
  antigravity: ['antigravity'],
  'opencode-go': ['opencode'],
  minimax: ['minimax'],
  grok: ['grok'],
  cursor: ['cursor'],
  zcode: ['zcode']
}

export function isVendorAccountAllowed(agentId: string, policy: VendorAccountPolicy): boolean {
  return (
    !policy.disableVendorProviderAccounts && isAgentAllowedByPolicy(agentId, policy.allowedAgents)
  )
}

/**
 * Hide the account sections of vendors the corporate policy does not allow.
 *
 * Two separate rules, because agents and vendor credentials are different axes: a Bedrock fleet
 * needs `allowedAgents: ["claude"]` — the CLI binary — while forbidding the platform.claude.com
 * login that shares its name. Only `disableVendorProviderAccounts` removes it.
 */
export function isAccountSectionAllowedByPolicy(
  section: ReactNode,
  policy: VendorAccountPolicy
): boolean {
  const agents = accountSectionAgents(section)
  return !agents || agents.some((agentId) => isVendorAccountAllowed(agentId, policy))
}

function accountSectionAgents(section: ReactNode): readonly string[] | null {
  if (!isValidElement<{ children?: ReactNode }>(section)) {
    return null
  }
  const byKey =
    typeof section.key === 'string'
      ? ACCOUNT_SECTION_AGENTS_BY_KEY[section.key.split(':')[0]]
      : null
  if (byKey) {
    return byKey
  }
  // Upstream keys the managed-data block by runtime environment id, so recognise it by content.
  const providers = Children.toArray(section.props.children).flatMap((child) =>
    isValidElement<{ provider: string }>(child) &&
    child.type === PolicyGatedManagedDataAccountsSection
      ? [child.props.provider]
      : []
  )
  return providers.length > 0 ? providers : null
}

/** Upstream's managed-data section, rendered only for a provider the policy allows. */
export function PolicyGatedManagedDataAccountsSection(
  props: ComponentProps<typeof ManagedDataAccountsSection>
): React.JSX.Element | null {
  const policy = useEnterprisePolicyView()
  return isVendorAccountAllowed(props.provider, policy) ? (
    <ManagedDataAccountsSection {...props} />
  ) : null
}

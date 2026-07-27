// Test-only builder for a fully-populated EnterprisePolicy. Kept out of *.test.ts
// so the gate tests spread across src/main can share one shape: adding a switch
// to the policy then updates every consumer's fixture in one place.

import type { EnterprisePolicy } from '../../shared/enterprise-policy'

const UNLOCKED: EnterprisePolicy = {
  lockdown: false,
  disableTelemetry: false,
  disableAutoUpdate: false,
  disableStarNag: false,
  disableCloudRelay: false,
  disableUsagePolling: false,
  disableManagedClaudeAccounts: false,
  disableSpellcheck: false,
  enforceNetworkAllowlist: false,
  allowedNetworkHosts: [],
  githubEnterpriseHost: null,
  allowedAgents: null,
  llmEndpoints: [],
  sourcePath: null,
  warnings: []
}

/** An unlocked policy by default; pass only the switches the case is about. */
export function makeEnterprisePolicy(overrides: Partial<EnterprisePolicy> = {}): EnterprisePolicy {
  return { ...UNLOCKED, ...overrides }
}

/** Every lockdown-inheriting switch on, as a real `"lockdown": true` file resolves. */
export function makeLockdownPolicy(overrides: Partial<EnterprisePolicy> = {}): EnterprisePolicy {
  return {
    ...UNLOCKED,
    lockdown: true,
    disableTelemetry: true,
    disableAutoUpdate: true,
    disableStarNag: true,
    disableCloudRelay: true,
    disableUsagePolling: true,
    disableManagedClaudeAccounts: true,
    disableSpellcheck: true,
    sourcePath: '/etc/orca/enterprise-policy.json',
    ...overrides
  }
}

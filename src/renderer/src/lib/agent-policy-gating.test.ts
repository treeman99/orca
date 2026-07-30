// Behavioural tests for the corporate agent allowlist on the renderer side.
//
// The resolver already has tests proving the policy object is right. These prove the pickers
// actually narrow — and, just as importantly, that the surfaces which must NOT narrow (a
// running agent's own name, its icon) still resolve, because the previous shape of this code
// filtered the one catalog everything read.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../shared/enterprise-policy-view'

const UNRESTRICTED: EnterprisePolicyView = {
  allowedAgents: null,
  lockdown: false,
  disableAutoUpdate: false,
  disableMobilePairing: false,
  disableMobileEmulator: false,
  disableExternalAutomations: false,
  disableAgentInstallSuggestions: false,
  disableUsagePolling: false,
  disableVendorProviderAccounts: false,
  disableRemoteOrcaServer: false,
  disableVoice: false,
  requireComputerUseApproval: false
}

const policyState = vi.hoisted(() => ({ current: null as EnterprisePolicyView | null }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  getEnterprisePolicyView: () => policyState.current,
  getPolicyAllowedAgents: () => policyState.current?.allowedAgents ?? null,
  useEnterprisePolicyView: () => policyState.current
}))

import { getAgentCatalog, getAgentLabel, getFullAgentCatalog } from './agent-catalog'
import { pickQuickWorkspaceAgent } from './quick-workspace-agent-selection'
import { groupDefinitions } from '@/components/settings/shortcut-groups'

function setPolicy(overrides: Partial<EnterprisePolicyView> = {}): void {
  policyState.current = { ...UNRESTRICTED, ...overrides }
}

function catalogIds(): string[] {
  return getAgentCatalog().map((agent) => agent.id)
}

describe('agent catalog under the corporate allowlist', () => {
  beforeEach(() => {
    setPolicy()
  })

  it('offers the whole catalog when no allowlist is set', () => {
    expect(catalogIds()).toContain('codex')
    expect(catalogIds().length).toBeGreaterThan(10)
  })

  it('offers only the allowed agents once one is set', () => {
    setPolicy({ allowedAgents: ['claude', 'opencode'] })
    expect(catalogIds()).toEqual(['claude', 'opencode'])
  })

  // The full catalog stays reachable on purpose: an agent the policy now hides may still be
  // running in a pane, and it must render its own name and icon rather than a bare id.
  it('keeps names resolvable for an agent the policy hides', () => {
    setPolicy({ allowedAgents: ['claude'] })
    expect(catalogIds()).not.toContain('codex')
    expect(getAgentLabel('codex')).toBe('Codex')
    expect(getFullAgentCatalog().map((agent) => agent.id)).toContain('codex')
  })

  // allowedAgents is deliberately not lockdown-inheriting: an admin has to name the agents,
  // because which CLIs a site standardizes on is not something a master switch can guess.
  it('does not narrow on the master lockdown switch alone', () => {
    setPolicy({ lockdown: true })
    expect(catalogIds()).toContain('codex')
  })
})

describe('quick workspace agent auto-pick', () => {
  beforeEach(() => {
    setPolicy({ allowedAgents: ['claude', 'opencode'] })
  })

  // The regression this closes: the picker LIST was filtered but the pre-selected value came
  // from the raw auto-pick order, so the Create Workspace dialog opened on a blocked agent
  // and submitting launched it.
  it('never pre-selects a blocked agent while detection is still in flight', () => {
    expect(pickQuickWorkspaceAgent(null, null, [])).toBe('claude')
  })

  it('does not resurrect a blocked agent that detection reported', () => {
    // Detection is filtered in main; belt-and-braces here for a stale renderer set.
    expect(pickQuickWorkspaceAgent(null, ['opencode'], [])).toBe('opencode')
  })

  it('honors an explicit preference among the allowed agents', () => {
    expect(pickQuickWorkspaceAgent('opencode', ['claude', 'opencode'], [])).toBe('opencode')
  })

  it('keeps the upstream order when nothing is restricted', () => {
    setPolicy()
    expect(pickQuickWorkspaceAgent(null, null, [])).toBe('claude')
  })
})

describe('keyboard shortcut rows under policy', () => {
  function agentRowIds(): string[] {
    return groupDefinitions([]).flatMap((group) => group.items.map((item) => item.id))
  }

  beforeEach(() => {
    setPolicy()
  })

  // A chord bound to a blocked agent fires without detection, so the row has to go with it.
  it('drops the launch row for a blocked agent', () => {
    expect(agentRowIds()).toContain('tab.newAgent.codex')
    setPolicy({ allowedAgents: ['claude', 'opencode'] })
    expect(agentRowIds()).not.toContain('tab.newAgent.codex')
    expect(agentRowIds()).toContain('tab.newAgent.claude')
  })

  it('drops the emulator chord when the emulator is disabled', () => {
    expect(agentRowIds()).toContain('tab.newSimulator')
    setPolicy({ disableMobileEmulator: true })
    expect(agentRowIds()).not.toContain('tab.newSimulator')
  })
})

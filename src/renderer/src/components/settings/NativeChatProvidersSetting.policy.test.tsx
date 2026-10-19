// @vitest-environment happy-dom
// Behavioural gate test for Settings → Chat → Providers (v1.4.230) under the corporate policy:
// the list keeps only allowed agents, and the "Install" vendor link follows
// disableAgentInstallSuggestions like the Agents pane's install suggestions do.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { decodeAgentSessionAgentsResult } from '../../../../shared/agent-session-registered-agents'
import type * as HostStructuredAgentsModule from '@/runtime/host-structured-agents'

const UNRESTRICTED: EnterprisePolicyView = {
  allowedAgents: null,
  allowedModels: null,
  lockdown: false,
  disableAutoUpdate: false,
  disableCloudRelay: false,
  disableMobilePairing: false,
  disableMobileEmulator: false,
  disableExternalAutomations: false,
  disableUnattendedAgentRuns: false,
  disableAgentInstallSuggestions: false,
  disableUsagePolling: false,
  disableVendorProviderAccounts: false,
  disableRemoteOrcaServer: false,
  disableVoice: false,
  disablePlugins: false,
  disableVendorLinks: false,
  requireComputerUseApproval: false,
  disableChatVisuals: false
}

const policyState = vi.hoisted(() => ({ current: null as EnterprisePolicyView | null }))
const state = vi.hoisted(
  (): {
    settingsSearchQuery: string
    settings: GlobalSettings | null
    localDetectedAgentIdsByContext: Record<string, TuiAgent[] | null>
  } => ({ settingsSearchQuery: '', settings: null, localDetectedAgentIdsByContext: {} })
)

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  getEnterprisePolicyView: () => policyState.current,
  getPolicyAllowedAgents: () => policyState.current?.allowedAgents ?? null,
  useEnterprisePolicyView: () => policyState.current
}))
vi.mock('@/runtime/host-structured-agents', async (importOriginal) => ({
  ...(await importOriginal<typeof HostStructuredAgentsModule>()),
  readHostStructuredAgents: () =>
    decodeAgentSessionAgentsResult({ agents: [{ agent: 'grok', capabilities: {} }] }) ?? []
}))
vi.mock('../../store', () => ({
  useAppStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
    getState: () => state
  })
}))

import { NativeChatProvidersSetting } from './NativeChatProvidersSetting'

function renderProviders(policy: Partial<EnterprisePolicyView>): void {
  policyState.current = { ...UNRESTRICTED, ...policy }
  const settings = getDefaultSettings('/tmp')
  state.settings = settings
  render(<NativeChatProvidersSetting settings={settings} updateSettings={vi.fn()} />)
}

describe('Chat providers under the enterprise policy', () => {
  beforeEach(() => {
    // Nothing detected on this host, so every listed agent shows its install state.
    state.localDetectedAgentIdsByContext = { host: [] }
  })
  afterEach(() => {
    cleanup()
  })

  it('lists only the agents the policy allows', () => {
    renderProviders({ allowedAgents: ['claude'] })

    expect(screen.queryByRole('switch', { name: 'Open Claude as a chat' })).not.toBeNull()
    expect(screen.queryByRole('switch', { name: 'Open Codex as a chat' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Open Grok as a chat' })).toBeNull()
  })

  it('lists every agent when no allowlist applies', () => {
    renderProviders({})

    expect(screen.queryByRole('switch', { name: 'Open Codex as a chat' })).not.toBeNull()
    expect(screen.queryByRole('switch', { name: 'Open Grok as a chat' })).not.toBeNull()
  })

  it('drops the vendor install link under disableAgentInstallSuggestions', () => {
    renderProviders({ allowedAgents: ['claude'], disableAgentInstallSuggestions: true })

    expect(screen.queryByText('Not installed')).not.toBeNull()
    expect(screen.queryByRole('link', { name: 'Install' })).toBeNull()
  })

  it('keeps the vendor install link without the policy', () => {
    renderProviders({ allowedAgents: ['claude'] })

    expect(screen.queryByRole('link', { name: 'Install' })).not.toBeNull()
  })
})

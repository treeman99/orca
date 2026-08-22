// Behavioural gate test for Settings → Agents under the corporate policy.
//
// Kept out of AgentsPane.test.tsx because that file pins the UNGATED behaviour (every catalog
// agent discoverable in settings search) and needs the real policy module to do it.

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'
import type { TuiAgent } from '../../../../shared/tui-agent'

const UNRESTRICTED: EnterprisePolicyView = {
  allowedAgents: null,
  lockdown: false,
  disableAutoUpdate: false,
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
  requireComputerUseApproval: false
}

const policyState = vi.hoisted(() => ({ current: null as EnterprisePolicyView | null }))
const detectedAgentsMock = vi.hoisted(() => ({ detectedIds: ['claude'] as TuiAgent[] | null }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  getEnterprisePolicyView: () => policyState.current,
  getPolicyAllowedAgents: () => policyState.current?.allowedAgents ?? null,
  useEnterprisePolicyView: () => policyState.current
}))

vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: () => ({
    detectedIds: detectedAgentsMock.detectedIds,
    isLoading: false,
    detectionFailed: false,
    refresh: vi.fn()
  })
}))

import { AgentsPane } from './AgentsPane'
import { TooltipProvider } from '../ui/tooltip'

function setPolicy(overrides: Partial<EnterprisePolicyView> = {}): void {
  policyState.current = { ...UNRESTRICTED, ...overrides }
}

function render(): string {
  return renderToStaticMarkup(
    React.createElement(
      TooltipProvider,
      null,
      React.createElement(AgentsPane, {
        settings: getDefaultSettings('/tmp'),
        updateSettings: vi.fn()
      })
    )
  )
}

describe('Settings → Agents under enterprise policy', () => {
  beforeEach(() => {
    setPolicy()
    detectedAgentsMock.detectedIds = ['claude']
  })

  it('offers the install list by default', () => {
    expect(render()).toContain('Available to install')
  })

  // On a fleet where CLIs arrive through corporate software distribution, "go install this
  // yourself" is the wrong instruction — and each row links out to the vendor's site to do it.
  it('drops the install list, and the vendor links in it, under policy', () => {
    setPolicy({ disableAgentInstallSuggestions: true })
    const markup = render()
    expect(markup).not.toContain('Available to install')
    expect(markup).not.toContain('openai.com')
  })

  // The gate empties the only section that renders when nothing is detected, so without a
  // replacement the pane reads as a broken screen rather than as a policy.
  it('explains the empty pane when detection found nothing', () => {
    detectedAgentsMock.detectedIds = []
    setPolicy({ disableAgentInstallSuggestions: true })
    expect(render()).toContain('software distribution')
  })

  it('says nothing extra when an agent was detected', () => {
    setPolicy({ disableAgentInstallSuggestions: true })
    expect(render()).not.toContain('software distribution')
  })

  it('narrows the detected list to the allowed agents', () => {
    detectedAgentsMock.detectedIds = ['claude', 'codex']
    setPolicy({ allowedAgents: ['claude'] })
    const markup = render()
    expect(markup).toContain('Claude')
    expect(markup).not.toContain('>Codex<')
  })
})

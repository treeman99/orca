import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcState = vi.hoisted(() => ({
  handleHandlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  onHandlers: new Map<string, (event: { returnValue?: unknown }) => void>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      ipcState.handleHandlers.set(channel, handler)
    },
    on: (channel: string, handler: (event: { returnValue?: unknown }) => void) => {
      ipcState.onHandlers.set(channel, handler)
    }
  }
}))

import { registerEnterprisePolicyHandlers } from './enterprise-policy'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../enterprise/enterprise-policy-fixture'
import type { EnterprisePolicyView } from '../../shared/enterprise-policy-view'

const VIEW_FIELDS = [
  'allowedAgents',
  'disableAgentInstallSuggestions',
  'disableAutoUpdate',
  'disableExternalAutomations',
  'disableMobileEmulator',
  'disableMobilePairing',
  'disablePlugins',
  'disableRemoteOrcaServer',
  'disableUsagePolling',
  'disableVendorLinks',
  'disableVendorProviderAccounts',
  'disableVoice',
  'lockdown',
  'requireComputerUseApproval'
]

function invokeGet(): EnterprisePolicyView {
  const handler = ipcState.handleHandlers.get('enterprisePolicy:get')
  if (!handler) {
    throw new Error('enterprisePolicy:get was not registered')
  }
  return handler({}) as EnterprisePolicyView
}

describe('registerEnterprisePolicyHandlers', () => {
  beforeEach(() => {
    ipcState.handleHandlers.clear()
    ipcState.onHandlers.clear()
  })

  it('exposes the allowlist and lockdown flag from the policy', () => {
    registerEnterprisePolicyHandlers(() =>
      makeEnterprisePolicy({ allowedAgents: ['claude'], lockdown: true })
    )
    expect(invokeGet()).toMatchObject({ allowedAgents: ['claude'], lockdown: true })
  })

  it('reports no restriction when the policy has none', () => {
    registerEnterprisePolicyHandlers(() => makeEnterprisePolicy())
    expect(invokeGet()).toEqual({
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
      disablePlugins: false,
      disableVendorLinks: false,
      requireComputerUseApproval: false
    })
  })

  // A lockdown file must reach the UI as "hide all of this", not just as `lockdown: true`
  // — the panes gate on the individual switches so an admin can opt one back in.
  it('forwards every lockdown-inherited UI switch', () => {
    registerEnterprisePolicyHandlers(() => makeLockdownPolicy())
    expect(invokeGet()).toEqual({
      allowedAgents: null,
      lockdown: true,
      disableAutoUpdate: true,
      disableMobilePairing: true,
      disableMobileEmulator: true,
      disableExternalAutomations: true,
      disableAgentInstallSuggestions: true,
      disableUsagePolling: true,
      disableVendorProviderAccounts: true,
      disableRemoteOrcaServer: true,
      disableVoice: true,
      disablePlugins: true,
      disableVendorLinks: true,
      requireComputerUseApproval: true
    })
  })

  it('honors a single feature opted back in', () => {
    registerEnterprisePolicyHandlers(() => makeLockdownPolicy({ disableVoice: false }))
    expect(invokeGet()).toMatchObject({ disableVoice: false, disableMobilePairing: true })
  })

  // The sync channel is what the renderer reads at module evaluation, before any memoized
  // gate can freeze an answer. If it ever diverges from the async one, half the gates in the
  // app read a different policy than the other half.
  it('projects the same view over the synchronous channel', () => {
    registerEnterprisePolicyHandlers(() => makeLockdownPolicy({ allowedAgents: ['claude'] }))
    const syncHandler = ipcState.onHandlers.get('enterprisePolicy:get-sync')
    if (!syncHandler) {
      throw new Error('enterprisePolicy:get-sync was not registered')
    }
    const event: { returnValue?: unknown } = {}
    syncHandler(event)
    expect(event.returnValue).toEqual(invokeGet())
  })

  // Why: the renderer is in the threat model — only the gating fields may cross.
  it('does not leak other policy fields to the renderer', () => {
    registerEnterprisePolicyHandlers(() =>
      makeEnterprisePolicy({
        allowedAgents: ['claude'],
        githubEnterpriseHost: 'github.samsungds.net',
        sourcePath: '/etc/orca/enterprise-policy.json',
        llmEndpoints: [
          {
            id: 'internal',
            label: 'Internal',
            baseUrl: 'https://llm.example.net/v1',
            api: 'openai',
            model: 'internal-code'
          }
        ]
      })
    )
    expect(Object.keys(invokeGet()).sort()).toEqual(VIEW_FIELDS)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcState = vi.hoisted(() => ({
  handleHandlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      ipcState.handleHandlers.set(channel, handler)
    }
  }
}))

import { registerEnterprisePolicyHandlers } from './enterprise-policy'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../enterprise/enterprise-policy-fixture'
import type { EnterprisePolicyView } from '../../shared/enterprise-policy-view'

const VIEW_FIELDS = [
  'allowedAgents',
  'disableAutoUpdate',
  'disableMobilePairing',
  'disableRemoteOrcaServer',
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
      disableVendorProviderAccounts: false,
      disableRemoteOrcaServer: false,
      disableVoice: false,
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
      disableVendorProviderAccounts: true,
      disableRemoteOrcaServer: true,
      disableVoice: true,
      requireComputerUseApproval: true
    })
  })

  it('honors a single feature opted back in', () => {
    registerEnterprisePolicyHandlers(() => makeLockdownPolicy({ disableVoice: false }))
    expect(invokeGet()).toMatchObject({ disableVoice: false, disableMobilePairing: true })
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

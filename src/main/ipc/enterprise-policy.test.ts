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
import { makeEnterprisePolicy } from '../enterprise/enterprise-policy-fixture'
import type { EnterprisePolicyView } from '../../shared/enterprise-policy-view'

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
    expect(invokeGet()).toEqual({ allowedAgents: ['claude'], lockdown: true })
  })

  it('reports no restriction when the policy has none', () => {
    registerEnterprisePolicyHandlers(() => makeEnterprisePolicy())
    expect(invokeGet()).toEqual({ allowedAgents: null, lockdown: false })
  })

  // Why: the renderer is in the threat model — only the two gating fields may cross.
  it('does not leak other policy fields to the renderer', () => {
    registerEnterprisePolicyHandlers(() =>
      makeEnterprisePolicy({
        allowedAgents: ['claude'],
        githubEnterpriseHost: 'github.samsungds.net',
        sourcePath: '/etc/orca/enterprise-policy.json'
      })
    )
    expect(Object.keys(invokeGet()).sort()).toEqual(['allowedAgents', 'lockdown'])
  })
})

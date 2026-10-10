// disableChatVisuals (v1.4.224): an inline visual runs agent-written HTML that loads code from public
// CDNs. Both host-side doors are covered — the launch that hands a chat its visuals folder and
// skill, and `agentSession.readVisual`, which would still serve a folder written before the policy.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { nativeChatVisualsAllowed } from './native-chat-visuals-policy'
import { STRUCTURED_AGENT_SESSION_VISUAL_METHODS } from '../runtime/rpc/methods/structured-agent-session-visual'
import type { RpcContext } from '../runtime/rpc/core'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  requireInstalledStructuredHost: vi.fn()
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))
vi.mock('../runtime/rpc/methods/structured-agent-session-gate', () => ({
  requireInstalledStructuredHost: mocks.requireInstalledStructuredHost
}))

async function readVisual(): Promise<unknown> {
  const [method] = STRUCTURED_AGENT_SESSION_VISUAL_METHODS
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler hands ctx only to requireInstalledStructuredHost, which this file mocks.
  const ctx = {} as RpcContext
  return method.handler({ sessionId: 'chat-1', file: 'chart.html' }, ctx)
}

describe('inline chat visuals under the corporate policy', () => {
  beforeEach(() => {
    mocks.getEnterprisePolicy.mockReset()
    mocks.requireInstalledStructuredHost.mockReset()
  })

  it('gives a launch no visuals under lockdown, whatever the setting says', () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())

    expect(nativeChatVisualsAllowed({ nativeChatInlineVisuals: true })).toBe(false)
    expect(nativeChatVisualsAllowed({})).toBe(false)
  })

  it('follows the setting when the policy leaves visuals on', () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())

    expect(nativeChatVisualsAllowed({})).toBe(true)
    expect(nativeChatVisualsAllowed({ nativeChatInlineVisuals: false })).toBe(false)
  })

  it('serves no visual file under lockdown, before touching the chat host', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeLockdownPolicy())

    await expect(readVisual()).resolves.toEqual({ ok: false, error: 'not_found' })
    expect(mocks.requireInstalledStructuredHost).not.toHaveBeenCalled()
  })

  it('reads through the chat host when the policy leaves visuals on', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
    mocks.requireInstalledStructuredHost.mockResolvedValue({
      deps: { store: { getRecord: () => null } }
    })

    await expect(readVisual()).resolves.toEqual({ ok: false, error: 'session_not_found' })
    expect(mocks.requireInstalledStructuredHost).toHaveBeenCalledTimes(1)
  })
})

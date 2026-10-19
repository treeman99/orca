// Fork-owned: v1.4.230's `pty:claudeDiffPanelMayAutoOpen` answers by spawning `claude --version`.
// A fleet whose allowedAgents leaves Claude out must not spawn it for a renderer question.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy } from '../../../../shared/enterprise-policy-fixture'

type Handler = (event: unknown, args: { id: unknown; target?: unknown }) => Promise<boolean>

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  getEnterprisePolicy: vi.fn(),
  probe: vi.fn(async () => '2.1.301'),
  mayAutoOpen: vi.fn(async () => true)
}))

vi.mock('../../../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))
vi.mock('../../pty-host-bindings', () => ({
  getPtyIpc: () => ({
    handle: (channel: string, handler: Handler) => mocks.handlers.set(channel, handler)
  })
}))
vi.mock('../provider/ownership-state', () => ({ ptyOwnership: new Map<string, string>() }))
vi.mock('../provider/registry', () => ({
  tryGetProviderForPty: () => ({ getAppliedSize: async () => ({ cols: 180, rows: 40 }) })
}))
vi.mock('../../../claude/claude-hook-event-versions', () => ({
  probeRecentClaudeCliVersion: mocks.probe
}))
vi.mock('../../../codex-cli/command', () => ({ resolveClaudeCommand: () => '/bin/claude' }))
vi.mock('../../../claude-accounts/claude-profile-installed-router', () => ({
  getClaudeProfileRouter: () => null
}))
vi.mock('../../../claude/claude-diff-panel-auto-open', () => ({
  claudeDiffPanelMayAutoOpen: mocks.mayAutoOpen
}))

import { installPtyClaudeDiffPanelNoticeIpcHandler } from './claude-diff-panel-notice'

function ask(): Promise<boolean> {
  return mocks.handlers.get('pty:claudeDiffPanelMayAutoOpen')!(
    {},
    { id: 'pty-1', target: { runtime: 'host' } }
  )
}

describe('pty:claudeDiffPanelMayAutoOpen under the agent allowlist', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.probe.mockClear()
    mocks.mayAutoOpen.mockClear()
    installPtyClaudeDiffPanelNoticeIpcHandler({
      getLocalPtyProviderStartupPromise: () => undefined
    })
  })

  it('answers false without spawning claude when the policy leaves Claude out', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy({ allowedAgents: ['opencode'] }))

    expect(await ask()).toBe(false)
    expect(mocks.probe).not.toHaveBeenCalled()
  })

  it('probes when Claude is allowed', async () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy({ allowedAgents: ['claude'] }))

    expect(await ask()).toBe(true)
    expect(mocks.probe).toHaveBeenCalledTimes(1)
  })
})

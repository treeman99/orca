// Behavioural tests for the corporate-policy sweep of managed agent hooks. A resolver test
// would only prove the policy object is right; these prove the launchers actually leave
// ~/.orca/agent-hooks, and that an unrestricted policy still touches nothing.

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import type * as NodeOs from 'node:os'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  homedir: vi.fn(),
  removeClaude: vi.fn(),
  removeGemini: vi.fn(),
  removeCursor: vi.fn(),
  statusClaude: vi.fn(),
  statusGemini: vi.fn(),
  statusCursor: vi.fn(),
  calls: [] as string[]
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeOs>()),
  homedir: mocks.homedir
}))

vi.mock('./managed-agent-hook-registry', () => ({
  MANAGED_AGENT_HOOK_REMOVERS: [
    ['claude', mocks.removeClaude],
    ['gemini', mocks.removeGemini],
    ['cursor', mocks.removeCursor]
  ],
  MANAGED_AGENT_HOOK_STATUS_READERS: [
    ['claude', mocks.statusClaude],
    ['gemini', mocks.statusGemini],
    ['cursor', mocks.statusCursor]
  ]
}))

import { sweepEnterpriseBlockedAgentHooks } from './enterprise-agent-hook-sweep'

let home: string

function hookDir(): string {
  return join(home, '.orca', 'agent-hooks')
}

function seedLaunchers(...fileNames: string[]): void {
  mkdirSync(hookDir(), { recursive: true })
  for (const fileName of fileNames) {
    writeFileSync(join(hookDir(), fileName), '#!/bin/sh\n')
  }
}

describe('enterprise agent hook sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.calls.length = 0
    home = mkdtempSync(join(tmpdir(), 'orca-hook-sweep-'))
    mocks.homedir.mockReturnValue(home)
    mocks.removeGemini.mockImplementation(() => ({ agent: 'gemini', state: 'not_installed' }))
    for (const status of [mocks.statusClaude, mocks.statusGemini, mocks.statusCursor]) {
      status.mockReturnValue({ managedHooksPresent: true })
    }
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('clears the config and deletes the launcher for a policy-blocked agent', () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeLockdownPolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    seedLaunchers('claude-hook.sh', 'gemini-hook.sh', 'cursor-hook.sh')

    sweepEnterpriseBlockedAgentHooks()

    expect(mocks.removeGemini).toHaveBeenCalledTimes(1)
    expect(mocks.removeCursor).toHaveBeenCalledTimes(1)
    expect(mocks.removeClaude).not.toHaveBeenCalled()
    expect(readdirSync(hookDir())).toEqual(['claude-hook.sh'])
  })

  it('clears the agent config before deleting its launcher', () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    seedLaunchers('gemini-hook.sh')
    // Why: reversing the order leaves the agent config invoking a script that is already gone,
    // erroring on every hook event — so the remover must still see its launcher on disk.
    mocks.removeGemini.mockImplementation(() => {
      mocks.calls.push(`remove:gemini:${readdirSync(hookDir()).join(',')}`)
      return { agent: 'gemini', state: 'not_installed' }
    })

    sweepEnterpriseBlockedAgentHooks()

    expect(mocks.calls).toEqual(['remove:gemini:gemini-hook.sh'])
    expect(readdirSync(hookDir())).toEqual([])
  })

  it('deletes every launcher a blocked agent owns, not just <agent>-hook.sh', () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    seedLaunchers(
      'claude-statusline.sh',
      'openclaude-statusline.sh',
      'antigravity-hook.sh',
      'antigravity-pre-tool-use.cmd',
      'copilot-hook.ps1'
    )

    sweepEnterpriseBlockedAgentHooks()

    expect(readdirSync(hookDir())).toEqual(['claude-statusline.sh'])
  })

  it('does nothing when the policy sets no agent allowlist', () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())
    seedLaunchers('claude-hook.sh', 'gemini-hook.sh', 'cursor-hook.sh')

    sweepEnterpriseBlockedAgentHooks()

    expect(mocks.removeGemini).not.toHaveBeenCalled()
    expect(mocks.removeCursor).not.toHaveBeenCalled()
    expect(readdirSync(hookDir()).sort()).toEqual([
      'claude-hook.sh',
      'cursor-hook.sh',
      'gemini-hook.sh'
    ])
  })

  it('is idempotent — a second sweep finds nothing left and does not throw', () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    seedLaunchers('gemini-hook.sh')

    sweepEnterpriseBlockedAgentHooks()

    expect(() => sweepEnterpriseBlockedAgentHooks()).not.toThrow()
    expect(readdirSync(hookDir())).toEqual([])
  })

  it('keeps sweeping after one agent config fails to parse', () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    mocks.removeGemini.mockImplementation(() => {
      throw new Error('Could not parse Gemini settings.json')
    })
    seedLaunchers('gemini-hook.sh', 'cursor-hook.sh')

    expect(() => sweepEnterpriseBlockedAgentHooks()).not.toThrow()
    expect(mocks.removeCursor).toHaveBeenCalledTimes(1)
    expect(readdirSync(hookDir())).toEqual([])
  })

  it('never calls remove() for an agent with no managed hooks installed', () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    // Why this matters: remove() ends in writeHooksJson(), which CREATES the vendor config when
    // it is absent — see enterprise-agent-hook-sweep-side-effects.test.ts for the real-service proof.
    mocks.statusGemini.mockReturnValue({ managedHooksPresent: false })
    mocks.statusCursor.mockReturnValue({ managedHooksPresent: false })
    seedLaunchers('gemini-hook.sh')

    sweepEnterpriseBlockedAgentHooks()

    expect(mocks.removeGemini).not.toHaveBeenCalled()
    expect(mocks.removeCursor).not.toHaveBeenCalled()
    // The launcher still goes: rmSync({force:true}) creates nothing for a file that is absent.
    expect(readdirSync(hookDir())).toEqual([])
  })

  it('keeps sweeping when a status read throws', () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    mocks.statusGemini.mockImplementation(() => {
      throw new Error('status unavailable')
    })
    seedLaunchers('gemini-hook.sh', 'cursor-hook.sh')

    expect(() => sweepEnterpriseBlockedAgentHooks()).not.toThrow()
    expect(mocks.removeGemini).not.toHaveBeenCalled()
    expect(mocks.removeCursor).toHaveBeenCalledTimes(1)
    expect(readdirSync(hookDir())).toEqual([])
  })

  it('tolerates a missing ~/.orca/agent-hooks directory', () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )

    expect(() => sweepEnterpriseBlockedAgentHooks()).not.toThrow()
  })
})

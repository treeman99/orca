// The sweep's side-effect contract, exercised against the REAL removers and status readers.
//
// The sibling enterprise-agent-hook-sweep.test.ts mocks managed-agent-hook-registry, so it never
// runs a real remove() — and a real remove() ends in writeHooksJson(), which creates the vendor
// config file and its directory when they are absent (readHooksJson returns `{}` for a missing
// file, so "nothing installed" is indistinguishable from "installed nothing"). That is how a
// sweep meant to DELETE ~/.gemini's managed entries ended up CREATING ~/.gemini on machines
// where Gemini was never installed. This file is the guard: a sweep over an empty home must
// leave that home byte-for-byte empty.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import type * as NodeOs from 'node:os'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy } from '../../shared/enterprise-policy-fixture'

const mocks = vi.hoisted(() => ({
  getEnterprisePolicy: vi.fn(),
  homedir: vi.fn()
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: mocks.getEnterprisePolicy
}))

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeOs>()),
  homedir: mocks.homedir
}))

// No managed-agent-hook-registry mock on purpose: the real per-agent services must run.
import { geminiHookService } from '../gemini/hook-service'
import { sweepEnterpriseBlockedAgentHooks } from './enterprise-agent-hook-sweep'

let home: string

function listHomeEntries(): string[] {
  if (!existsSync(home)) {
    return []
  }
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name)
      found.push(relative(home, absolute))
      if (entry.isDirectory()) {
        walk(absolute)
      }
    }
  }
  walk(home)
  return found.sort()
}

describe('enterprise agent hook sweep side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    home = mkdtempSync(join(tmpdir(), 'orca-hook-sweep-real-'))
    mocks.homedir.mockReturnValue(home)
    // Why: Codex's managed home resolves from userData, not homedir — point it inside the fake
    // home so a stray mkdir there shows up in the scan instead of escaping to the real profile.
    vi.stubEnv('ORCA_USER_DATA_PATH', join(home, 'orca-user-data'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(home, { recursive: true, force: true })
  })

  it('creates nothing in an empty home when every blocked agent is uninstalled', () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )

    expect(listHomeEntries()).toEqual([])
    sweepEnterpriseBlockedAgentHooks()

    // A blocked agent with no managed hooks installed must not get a config file, a config
    // directory, or a runtime-home mirror conjured for it by the cleanup pass.
    expect(listHomeEntries()).toEqual([])
  })

  it('creates nothing on a second sweep either', () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )

    sweepEnterpriseBlockedAgentHooks()
    sweepEnterpriseBlockedAgentHooks()

    expect(listHomeEntries()).toEqual([])
  })

  it('still clears a real install — the presence gate must not over-skip', () => {
    mocks.getEnterprisePolicy.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    expect(geminiHookService.install().managedHooksPresent).toBe(true)
    const settingsPath = join(home, '.gemini', 'settings.json')
    expect(readFileSync(settingsPath, 'utf-8')).toContain('gemini-hook')

    sweepEnterpriseBlockedAgentHooks()

    expect(readFileSync(settingsPath, 'utf-8')).not.toContain('gemini-hook')
    expect(existsSync(join(home, '.orca', 'agent-hooks', 'gemini-hook.sh'))).toBe(false)
    expect(geminiHookService.getStatus().managedHooksPresent).toBe(false)
  })

  it('creates nothing when the policy sets no allowlist', () => {
    mocks.getEnterprisePolicy.mockReturnValue(makeEnterprisePolicy())

    sweepEnterpriseBlockedAgentHooks()

    expect(listHomeEntries()).toEqual([])
  })
})

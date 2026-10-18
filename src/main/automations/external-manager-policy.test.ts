// Behavioural gate tests for the corporate policy on external automation providers.
//
// A resolver test would only prove the policy object is right. What matters here is that a
// blocked provider produces no manager, issues no relay request, and — above all — never
// reaches the provider CLI: these providers run an agent on a schedule with nobody at
// the keyboard, and an upstream rebase resolved the wrong way would drop that with a green
// suite.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Fs from 'node:fs'
import type * as FsPromises from 'node:fs/promises'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import type * as SshTargetRegistryModule from '../ssh/ssh-target-registry'

type SshTargetRegistry = typeof SshTargetRegistryModule

const execFileMock = vi.hoisted(() =>
  vi.fn((...args: unknown[]) => {
    const callback = args.at(-1)
    if (typeof callback === 'function') {
      ;(callback as (e: Error | null, o: string, s: string) => void)(null, '', '')
    }
    return { kill: vi.fn() }
  })
)
const existsSyncMock = vi.hoisted(() => vi.fn(() => true))
const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
const requestMock = vi.hoisted(() => vi.fn(async () => ({ jobs: [] })))
// v1.4.191 moved the PATH probe from child_process.execFile to the shared runProcess
// helper. Spy on that one: an execFile-only assertion would pass with the gate deleted.
const runProcessMock = vi.hoisted(() =>
  vi.fn(async () => ({ code: 0, stdout: '', stderr: '', timedOut: false }))
)

vi.mock('child_process', () => ({ execFile: execFileMock }))
vi.mock('@orca/process-host', () => ({ runProcess: runProcessMock }))
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof Fs>('fs')
  return { ...actual, existsSync: existsSyncMock }
})
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof Fs>('node:fs')
  return { ...actual, existsSync: existsSyncMock }
})
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof FsPromises>('node:fs/promises')
  return { ...actual, readFile: vi.fn(async () => JSON.stringify({ jobs: [] })) }
})
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))
// Upstream v1.4.190 moved this out of ../ipc/ssh so the SSH lane loads without ipcMain.
vi.mock('../ssh/ssh-target-registry', async () => {
  const actual = await vi.importActual<SshTargetRegistry>('../ssh/ssh-target-registry')
  return {
    ...actual,
    getActiveMultiplexer: () => ({ isDisposed: () => false, request: requestMock })
  }
})

import { createScopedExternalAutomations, runExternalAutomationAction } from './external-manager'
import { ExternalAutomationManagerCache } from './external-automation-manager-cache'
import { ExternalAutomationProbeScheduler } from './external-automation-probe-scheduler'
import type { ExternalAutomationProvider } from '../../shared/automations-types'
import type { DesktopSshTargetRegistry } from './external-automation-owner-guard'

// v1.4.191 replaced `listExternalAutomationManagers(store)` with a scoped, cached
// resolver. Drive the real one: the gate has to hold on the path the IPC layer uses,
// not on a helper kept alive for this test.
const registry = {
  getSshTargets: () => [
    { id: 'ssh-1', connectionId: 'ssh-1', label: 'host', host: 'host', user: 'dev', generation: 1 }
  ],
  getSshTarget: (id: string) =>
    id === 'ssh-1'
      ? { id, connectionId: id, label: 'host', host: 'host', user: 'dev', generation: 1 }
      : null
} as unknown as DesktopSshTargetRegistry

async function discoveredProviders(
  providers: readonly ExternalAutomationProvider[] = ['openclaw']
): Promise<ExternalAutomationProvider[]> {
  const scoped = createScopedExternalAutomations({
    registry,
    scheduler: new ExternalAutomationProbeScheduler(),
    cache: new ExternalAutomationManagerCache()
  })
  const found: ExternalAutomationProvider[] = []
  for (const provider of providers) {
    const entry = await scoped.listManager({
      provider,
      owner: { authority: { kind: 'desktop' }, selector: { kind: 'self' } }
    } as Parameters<typeof scoped.listManager>[0])
    if (entry.manager) {
      found.push(entry.manager.provider)
    }
  }
  return found
}

const localTarget = { type: 'local' } as const

describe('external automations under enterprise policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    runProcessMock.mockResolvedValue({ code: 0, stdout: '', stderr: '', timedOut: false })
    requestMock.mockResolvedValue({ jobs: [] })
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
  })

  it('discovers no provider under a bare lockdown, and probes nothing', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    await expect(discoveredProviders()).resolves.toEqual([])
    // The PATH probe and the ~/.openclaw read are both refused, not merely ignored.
    expect(runProcessMock).not.toHaveBeenCalled()
    expect(execFileMock).not.toHaveBeenCalled()
    expect(requestMock).not.toHaveBeenCalled()
  })

  it('discovers no provider when allowedAgents omits them, without the wholesale switch', async () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    await expect(discoveredProviders()).resolves.toEqual([])
    expect(requestMock).not.toHaveBeenCalled()
  })

  // Independent switches: an admin may allow the agent CLI for interactive sessions and
  // still refuse to let it run unattended on a schedule.
  it('keeps a provider whose agent id the allowlist permits', async () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'openclaw'] })
    )
    await expect(discoveredProviders()).resolves.toEqual(['openclaw'])
  })

  // Upstream v1.4.229 removed Hermes and with it create/update/runs; the job action is the one
  // path left that takes the provider from renderer-supplied input, so it is reachable over IPC
  // even when discovery returned nothing.
  it('refuses a job action outright rather than silently succeeding', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    await expect(
      runExternalAutomationAction({
        managerId: 'openclaw:local',
        provider: 'openclaw',
        target: localTarget,
        jobId: 'job-1',
        action: 'run'
      } as Parameters<typeof runExternalAutomationAction>[0])
    ).rejects.toThrow(/disabled by an enterprise policy/)
    expect(runProcessMock).not.toHaveBeenCalled()
    expect(execFileMock).not.toHaveBeenCalled()
  })
})

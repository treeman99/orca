// Behavioural gate tests for the corporate policy on external automation providers.
//
// A resolver test would only prove the policy object is right. What matters here is that a
// blocked provider produces no manager, issues no relay request, and — above all — never
// reaches execFile('hermes', …): these providers run an agent on a schedule with nobody at
// the keyboard, and an upstream rebase resolved the wrong way would drop that with a green
// suite.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Fs from 'node:fs'
import type * as FsPromises from 'node:fs/promises'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import type { Store } from '../persistence'

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

vi.mock('child_process', () => ({ execFile: execFileMock }))
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof Fs>('fs')
  return { ...actual, existsSync: existsSyncMock }
})
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof FsPromises>('node:fs/promises')
  return { ...actual, readFile: vi.fn(async () => JSON.stringify({ jobs: [] })) }
})
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))
vi.mock('../ipc/ssh', () => ({
  getActiveMultiplexer: () => ({ isDisposed: () => false, request: requestMock })
}))

import {
  createExternalAutomation,
  listExternalAutomationManagers,
  listExternalAutomationRuns,
  runExternalAutomationAction,
  updateExternalAutomation
} from './external-manager'

const store = {
  getSshTargets: () => [
    { id: 'ssh-1', connectionId: 'ssh-1', label: 'host', host: 'host', user: 'dev' }
  ]
} as unknown as Store

const localTarget = { type: 'local' } as const

describe('external automations under enterprise policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    requestMock.mockResolvedValue({ jobs: [] })
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
  })

  it('discovers no provider under a bare lockdown, and probes nothing', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    await expect(listExternalAutomationManagers(store)).resolves.toEqual([])
    // The PATH probe and the ~/.hermes read are both refused, not merely ignored.
    expect(execFileMock).not.toHaveBeenCalled()
    expect(requestMock).not.toHaveBeenCalled()
  })

  it('discovers no provider when allowedAgents omits them, without the wholesale switch', async () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    await expect(listExternalAutomationManagers(store)).resolves.toEqual([])
    expect(requestMock).not.toHaveBeenCalled()
  })

  // Independent switches: an admin may allow the agent CLI for interactive sessions and
  // still refuse to let it run unattended on a schedule.
  it('keeps a provider whose agent id the allowlist permits', async () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'hermes'] })
    )
    const managers = await listExternalAutomationManagers(store)
    expect(managers.map((manager) => manager.provider)).toContain('hermes')
    expect(managers.map((manager) => manager.provider)).not.toContain('openclaw')
  })

  it.each([
    [
      'create',
      () =>
        createExternalAutomation({
          managerId: 'hermes:local',
          provider: 'hermes',
          target: localTarget,
          name: 'nightly',
          prompt: 'do the thing',
          schedule: '0 3 * * *'
        } as Parameters<typeof createExternalAutomation>[0])
    ],
    [
      'update',
      () =>
        updateExternalAutomation({
          managerId: 'hermes:local',
          provider: 'hermes',
          target: localTarget,
          jobId: 'job-1',
          name: 'nightly',
          prompt: 'do the thing',
          schedule: '0 3 * * *'
        } as Parameters<typeof updateExternalAutomation>[0])
    ],
    [
      'act',
      () =>
        runExternalAutomationAction({
          managerId: 'hermes:local',
          provider: 'hermes',
          target: localTarget,
          jobId: 'job-1',
          action: 'run'
        } as Parameters<typeof runExternalAutomationAction>[0])
    ],
    [
      'runs',
      () =>
        listExternalAutomationRuns({
          managerId: 'hermes:local',
          provider: 'hermes',
          target: localTarget,
          jobId: 'job-1',
          page: 1,
          pageSize: 25
        } as Parameters<typeof listExternalAutomationRuns>[0])
    ]
  ])(
    // These four take the provider from renderer-supplied input, so they are reachable over
    // IPC even when discovery returned nothing.
    'refuses %s outright rather than silently succeeding',
    async (_name, call) => {
      getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
      await expect(call()).rejects.toThrow(/disabled by an enterprise policy/)
      expect(execFileMock).not.toHaveBeenCalled()
    }
  )
})

// Fork-owned: proves `disableUnattendedAgentRuns` stops the scheduler from starting an
// agent, not just the schedule fields the UI draws. A resolver test would only show the
// policy object is right; this one fails if an upstream merge drops the gate.
//
// Kept in its own file so an upstream split of service.test.ts cannot carry the gate away.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Repo } from '../../shared/repo-types'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { AutomationService } from './service'

const testState = { dir: '' }
const getEnterprisePolicyMock = vi.fn(() => makeEnterprisePolicy())

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))

vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf-8').slice('encrypted:'.length)
  }
}))

async function createStore() {
  vi.resetModules()
  const { Store, initDataPath } = await import('../persistence')
  initDataPath()
  return new Store()
}

const makeRepo = (overrides: Partial<Repo> = {}): Repo => ({
  id: 'r1',
  path: '/repo',
  displayName: 'test',
  badgeColor: '#fff',
  addedAt: 1,
  ...overrides
})

async function createDueAutomation() {
  const store = await createStore()
  store.addRepo(makeRepo())
  const automation = store.createAutomation({
    name: 'Morning check',
    prompt: 'Check the repo',
    agentId: 'claude',
    projectId: 'r1',
    workspaceMode: 'existing',
    workspaceId: 'wt1',
    timezone: 'UTC',
    rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
    dtstart: new Date('2026-05-12T00:00:00').getTime()
  })
  return { store, automation }
}

describe('AutomationService enterprise policy gate', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-automation-policy-test-'))
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('refuses a due scheduled run under lockdown and records it as skipped_policy', async () => {
    vi.setSystemTime(new Date('2026-05-13T08:59:00'))
    const { store, automation } = await createDueAutomation()
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    vi.setSystemTime(new Date('2026-05-13T09:01:00'))
    const send = vi.fn()
    const service = new AutomationService(store, { tickMs: 60_000 })
    service.setWebContents({ isDestroyed: () => false, send } as never)

    service.start()
    service.setRendererReady()
    await vi.waitFor(() => expect(store.listAutomationRuns(automation.id).length).toBe(1))
    service.stop()

    expect(send).not.toHaveBeenCalled()
    const run = store.listAutomationRuns(automation.id)[0]
    expect(run?.status).toBe('skipped_policy')
    expect(run?.error).toContain('policy')
    // The schedule still advances; a refused occurrence must not re-fire every tick.
    expect(store.listAutomations().find((entry) => entry.id === automation.id)?.nextRunAt).toBe(
      new Date('2026-05-14T09:00:00').getTime()
    )
  })

  it('never reaches the headless dispatcher under lockdown', async () => {
    vi.setSystemTime(new Date('2026-05-13T08:59:00'))
    const { store, automation } = await createDueAutomation()
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    vi.setSystemTime(new Date('2026-05-13T09:01:00'))
    const headlessDispatcher = vi.fn()
    const service = new AutomationService(store, { tickMs: 60_000, headlessDispatcher })

    service.start()
    await vi.waitFor(() => expect(store.listAutomationRuns(automation.id).length).toBe(1))
    service.stop()

    expect(headlessDispatcher).not.toHaveBeenCalled()
    expect(store.listAutomationRuns(automation.id)[0]?.status).toBe('skipped_policy')
  })

  it('still dispatches a manual run under lockdown — the switch is about the timer', async () => {
    vi.setSystemTime(new Date('2026-05-13T08:00:00'))
    const { store, automation } = await createDueAutomation()
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    const send = vi.fn()
    const service = new AutomationService(store, { tickMs: 60_000 })
    service.setWebContents({ isDestroyed: () => false, send } as never)
    service.setRendererReady()

    const run = await service.runNow(automation.id)

    expect(run.status).toBe('dispatching')
    expect(send).toHaveBeenCalledWith('automations:dispatchRequested', expect.any(Object))
  })

  it('dispatches the same scheduled run when the policy is unlocked', async () => {
    vi.setSystemTime(new Date('2026-05-13T08:59:00'))
    const { store, automation } = await createDueAutomation()

    vi.setSystemTime(new Date('2026-05-13T09:01:00'))
    const send = vi.fn()
    const service = new AutomationService(store, { tickMs: 60_000 })
    service.setWebContents({ isDestroyed: () => false, send } as never)

    service.start()
    service.setRendererReady()
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith('automations:dispatchRequested', expect.any(Object))
    )
    service.stop()

    expect(store.listAutomationRuns(automation.id)[0]?.status).toBe('dispatching')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Repo } from '../shared/repo-types'

const testState = { dir: '' }

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
  const { Store, initDataPath } = await import('./persistence')
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

describe('Store bot roster', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-bots-test-'))
  })

  afterEach(() => {
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('creates a bot with defaults and lists it by name', async () => {
    const store = await createStore()
    store.createBot({ name: 'Zeta', agentId: 'claude' })
    store.createBot({ name: 'Alpha', agentId: 'claude', title: 'First' })

    const bots = store.listBots()
    expect(bots.map((bot) => bot.name)).toEqual(['Alpha', 'Zeta'])
    // No avatar asked for means the generated face, and empty is how that is stored — the
    // roster would otherwise draw a face while the editor showed a 🤖 nobody picked.
    expect(bots[0].avatarEmoji).toBe('')
    expect(bots[0].workspaceKey).toBeNull()
    expect(bots[0].projectId).toBeNull()
  })

  it('stores the avatar exactly as picked, including a cleared one', async () => {
    const store = await createStore()
    const bot = store.createBot({ name: 'Zeta', agentId: 'claude', avatarEmoji: '🤖' })
    expect(bot.avatarEmoji).toBe('🤖')

    expect(store.updateBot(bot.id, { title: 'Watcher' }).avatarEmoji).toBe('🤖')
    // Back to the generated face: an omitted field keeps the current avatar, so clearing has
    // to be an explicit empty string rather than a falsy value the update coerces away.
    expect(store.updateBot(bot.id, { avatarEmoji: '' }).avatarEmoji).toBe('')
  })

  it('drops a malformed workspace key instead of storing it', async () => {
    const store = await createStore()
    const bot = store.createBot({
      name: 'Broken',
      agentId: 'claude',
      workspaceKey: 'not-a-workspace-key',
      projectId: 'r1'
    })
    expect(bot.workspaceKey).toBeNull()
    // A project without a workspace is meaningless to the routine lane.
    expect(bot.projectId).toBeNull()
  })

  it('keeps projectId and workspaceKey consistent through an update', async () => {
    const store = await createStore()
    const bot = store.createBot({
      name: 'Checker',
      agentId: 'claude',
      workspaceKey: 'worktree:r1::/wt',
      projectId: 'r1'
    })
    expect(bot.projectId).toBe('r1')

    const unbound = store.updateBot(bot.id, { workspaceKey: null })
    expect(unbound.workspaceKey).toBeNull()
    expect(unbound.projectId).toBeNull()
  })

  it('ignores undefined fields the renderer forwards verbatim', async () => {
    const store = await createStore()
    const bot = store.createBot({ name: 'Keeper', agentId: 'claude', title: 'Original' })
    const updated = store.updateBot(bot.id, { title: undefined, name: 'Renamed' })
    expect(updated.title).toBe('Original')
    expect(updated.name).toBe('Renamed')
  })

  // Deleting a roster entry must not silently cancel scheduled agent work.
  it('detaches routines on delete instead of deleting them', async () => {
    const store = await createStore()
    store.addRepo(makeRepo())
    const bot = store.createBot({
      name: 'Checker',
      agentId: 'claude',
      workspaceKey: 'worktree:r1::/wt',
      projectId: 'r1'
    })
    const routine = store.createAutomation({
      botId: bot.id,
      name: 'Morning check',
      prompt: 'Check',
      agentId: 'claude',
      projectId: 'r1',
      workspaceMode: 'existing',
      workspaceId: 'r1::/wt',
      timezone: 'UTC',
      rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
      dtstart: Date.now()
    })
    expect(store.listAutomations().find((entry) => entry.id === routine.id)?.botId).toBe(bot.id)

    store.deleteBot(bot.id)

    expect(store.listBots()).toEqual([])
    const survivor = store.listAutomations().find((entry) => entry.id === routine.id)
    expect(survivor).toBeDefined()
    expect(survivor?.botId).toBeNull()
    expect(survivor?.enabled).toBe(true)
  })

  it('survives a reload, and a state file with no bots key still loads', async () => {
    const store = await createStore()
    const bot = store.createBot({ name: 'Persisted', agentId: 'claude' })
    store.flush()

    const reloaded = await createStore()
    expect(reloaded.listBots().map((entry) => entry.id)).toEqual([bot.id])
  })
})

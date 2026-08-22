import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bot } from '../../../../shared/bot-types'

const deliverToBotMock = vi.hoisted(() => vi.fn())
const ensureTeammatesMock = vi.hoisted(() => vi.fn())
const startStandbyMock = vi.hoisted(() => vi.fn())

vi.mock('@/components/sidebar/bots/bot-chat-delivery', () => ({
  deliverToBot: deliverToBotMock,
  ensureProjectTeammateSessions: ensureTeammatesMock,
  startBotStandbySession: startStandbyMock
}))

const { createTestStore } = await import('./store-test-helpers')

const makeBot = (overrides: Partial<Bot> = {}): Bot => ({
  id: 'bot1',
  name: 'Release Checker',
  title: '',
  description: '',
  avatarEmoji: '🤖',
  agentId: 'claude',
  workspaceKey: 'worktree:r1::/wt',
  projectId: 'r1',
  chatPaneKey: null,
  createdAt: 0,
  updatedAt: 0,
  ...overrides
})

const checker = makeBot()
const reviewer = makeBot({ id: 'bot2', name: 'Code Reviewer' })

function seedBots(store: ReturnType<typeof createTestStore>): void {
  store.setState({ bots: [checker, reviewer], updateBot: vi.fn().mockResolvedValue(null) })
}

describe('sendBotMessage', () => {
  beforeEach(() => {
    deliverToBotMock.mockReset()
    ensureTeammatesMock.mockReset()
    ensureTeammatesMock.mockResolvedValue([])
    startStandbyMock.mockReset()
    deliverToBotMock.mockResolvedValue({ ok: true, paneKey: 'tab1:leaf1', launched: true })
  })

  it('sends a plain message to the selected bot and logs it', async () => {
    const store = createTestStore()
    seedBots(store)

    const outcome = await store.getState().sendBotMessage({ botId: 'bot1', text: '  build it  ' })

    expect(outcome).toEqual({ status: 'delivered', targetBotId: 'bot1', launched: true })
    expect(deliverToBotMock).toHaveBeenCalledWith(
      expect.objectContaining({ bot: checker, text: 'build it' })
    )
    expect(store.getState().botChatLog.bot1).toEqual([
      expect.objectContaining({ kind: 'sent', text: 'build it' })
    ])
  })

  it('ignores an empty message', async () => {
    const store = createTestStore()
    seedBots(store)
    expect(await store.getState().sendBotMessage({ botId: 'bot1', text: '   ' })).toBeNull()
    expect(deliverToBotMock).not.toHaveBeenCalled()
  })

  // The relay is the bot-to-bot half: the message goes to the RECIPIENT's session, with the
  // sender attributed, and shows on both threads.
  it('relays a leading @mention to the other bot with attribution', async () => {
    const store = createTestStore()
    seedBots(store)

    const outcome = await store
      .getState()
      .sendBotMessage({ botId: 'bot1', text: '@code-reviewer PR 3 좀 봐줘' })

    expect(outcome).toEqual({ status: 'delivered', targetBotId: 'bot2', launched: true })
    const delivered = deliverToBotMock.mock.calls[0][0]
    expect(delivered.bot).toBe(reviewer)
    expect(delivered.text).toContain('Release Checker')
    expect(delivered.text).toContain('PR 3 좀 봐줘')

    const state = store.getState()
    expect(state.botChatLog.bot1).toEqual([
      expect.objectContaining({ kind: 'relayed-out', counterpartName: 'Code Reviewer' })
    ])
    expect(state.botChatLog.bot2).toEqual([
      expect.objectContaining({ kind: 'relayed-in', counterpartName: 'Release Checker' })
    ])
  })

  it('marks the recipient unread only while the user is looking elsewhere', async () => {
    const store = createTestStore()
    seedBots(store)

    await store.getState().sendBotMessage({ botId: 'bot1', text: '@code-reviewer look' })
    expect(store.getState().unreadBotIds).toEqual(['bot2'])

    store.setState({ selectedBotId: 'bot2', unreadBotIds: [] })
    await store.getState().sendBotMessage({ botId: 'bot1', text: '@code-reviewer again' })
    expect(store.getState().unreadBotIds).toEqual([])
  })

  it('refuses an unknown handle instead of sending it as prose', async () => {
    const store = createTestStore()
    seedBots(store)

    const outcome = await store.getState().sendBotMessage({ botId: 'bot1', text: '@nobody hi' })

    expect(outcome).toEqual({ status: 'unknown-handle', handle: 'nobody' })
    expect(deliverToBotMock).not.toHaveBeenCalled()
  })

  // The binding follows the bot whose conversation actually opened.
  it('records the pane binding on the recipient, not the sender', async () => {
    const store = createTestStore()
    seedBots(store)
    const updateBot = vi.fn().mockResolvedValue(null)
    store.setState({ updateBot })

    await store.getState().sendBotMessage({ botId: 'bot1', text: '@code-reviewer look' })

    expect(updateBot).toHaveBeenCalledWith('bot2', { chatPaneKey: 'tab1:leaf1' })
  })

  it('reports a delivery failure and keeps the text in the thread', async () => {
    const store = createTestStore()
    seedBots(store)
    deliverToBotMock.mockResolvedValue({ ok: false, reason: 'folder_workspace' })

    const outcome = await store.getState().sendBotMessage({ botId: 'bot1', text: 'go' })

    expect(outcome).toEqual({ status: 'failed', reason: 'folder_workspace', botId: 'bot1' })
    expect(store.getState().botChatLog.bot1).toEqual([
      expect.objectContaining({ kind: 'error', text: 'go' })
    ])
    expect(store.getState().botSendInFlight).toEqual([])
  })

  it('clears the in-flight marker after a successful send', async () => {
    const store = createTestStore()
    seedBots(store)
    await store.getState().sendBotMessage({ botId: 'bot1', text: 'go' })
    expect(store.getState().botSendInFlight).toEqual([])
  })
})

// The roster has to be true before the coordinator reads it, or it concludes it has nobody
// to delegate to (the bug this replaced).
describe('teammate autostart', () => {
  beforeEach(() => {
    deliverToBotMock.mockReset()
    ensureTeammatesMock.mockReset()
    ensureTeammatesMock.mockResolvedValue([])
    deliverToBotMock.mockResolvedValue({ ok: true, paneKey: 'tab1:leaf1', launched: true })
  })

  it('brings up same-project teammates before delivering, and records their panes', async () => {
    const store = createTestStore()
    seedBots(store)
    const updateBot = vi.fn().mockResolvedValue(null)
    store.setState({ updateBot })
    ensureTeammatesMock.mockResolvedValue([{ botId: 'bot2', paneKey: 'tabX:leafX' }])

    await store.getState().sendBotMessage({ botId: 'bot1', text: 'go' })

    expect(ensureTeammatesMock).toHaveBeenCalledWith(
      expect.objectContaining({ bot: expect.objectContaining({ id: 'bot1' }) })
    )
    expect(updateBot).toHaveBeenCalledWith('bot2', { chatPaneKey: 'tabX:leafX' })
    expect(ensureTeammatesMock.mock.invocationCallOrder[0]).toBeLessThan(
      deliverToBotMock.mock.invocationCallOrder[0]
    )
  })
})

describe('startBotSession', () => {
  beforeEach(() => {
    startStandbyMock.mockReset()
  })

  it('starts a standby session and stores its pane', async () => {
    const store = createTestStore()
    seedBots(store)
    const updateBot = vi.fn().mockResolvedValue(null)
    store.setState({ updateBot })
    startStandbyMock.mockResolvedValue('tabS:leafS')

    expect(await store.getState().startBotSession('bot1')).toBe('tabS:leafS')
    expect(updateBot).toHaveBeenCalledWith('bot1', { chatPaneKey: 'tabS:leafS' })
    expect(store.getState().botSendInFlight).toEqual([])
  })

  it('reports failure without touching the binding', async () => {
    const store = createTestStore()
    seedBots(store)
    const updateBot = vi.fn().mockResolvedValue(null)
    store.setState({ updateBot })
    startStandbyMock.mockResolvedValue(null)

    expect(await store.getState().startBotSession('bot1')).toBeNull()
    expect(updateBot).not.toHaveBeenCalled()
  })

  it('reports failure for an unknown bot', async () => {
    const store = createTestStore()
    seedBots(store)
    expect(await store.getState().startBotSession('nope')).toBeNull()
  })
})

describe('markBotChatRead / clearBotChat', () => {
  it('drops the unread flag and the log for one bot only', async () => {
    const store = createTestStore()
    seedBots(store)
    await store.getState().sendBotMessage({ botId: 'bot1', text: '@code-reviewer look' })

    store.getState().markBotChatRead('bot2')
    expect(store.getState().unreadBotIds).toEqual([])

    store.getState().clearBotChat('bot1')
    expect(store.getState().botChatLog.bot1).toBeUndefined()
    expect(store.getState().botChatLog.bot2).toBeDefined()
  })
})

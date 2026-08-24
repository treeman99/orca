import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../../../shared/agent-status-types'
import type { Bot } from '../../../../../shared/bot-types'

const LEAF_ID = '1f0a4c2e-9b71-4d33-8e05-6c7a2b91d4f8'
const LIVE_PANE_KEY = `tab1:${LEAF_ID}`
const STARTED_PANE_KEY = `tab2:${LEAF_ID}`

const setActiveWorktree = vi.fn()
const setActiveTabForWorktree = vi.fn()
const setTabViewMode = vi.fn()
const startBotSession = vi.fn<(botId: string) => Promise<string | null>>()
const toastError = vi.fn()

const bot: Bot = {
  id: 'bot1',
  name: 'Release Checker',
  title: '',
  description: '',
  avatarEmoji: '',
  agentId: 'claude',
  workspaceKey: 'worktree:repo1::/wt',
  projectId: 'repo1',
  chatPaneKey: LIVE_PANE_KEY,
  createdAt: 0,
  updatedAt: 0
}

let state: Record<string, unknown>

vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))

function makeState(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    bots: [bot],
    agentStatusByPaneKey: {
      [LIVE_PANE_KEY]: { state: 'done', agentType: 'claude' } as AgentStatusEntry
    },
    ptyIdsByTabId: { tab1: ['pty1'] },
    terminalLayoutsByTabId: { tab1: { ptyIdsByLeafId: { [LEAF_ID]: 'pty1' } } },
    // parseWorkspaceKey strips the `worktree:` prefix, so the store is keyed without it.
    unifiedTabsByWorktree: { 'repo1::/wt': [{ contentType: 'terminal', entityId: 'tab1' }] },
    setActiveWorktree,
    setActiveTabForWorktree,
    setTabViewMode,
    startBotSession,
    ...overrides
  }
}

// A bot's own pane is its SESSION, so it opens as a terminal — that is where raw agent output
// and a failed delegation are legible. The chat surface is a room over several bots. Forcing
// 'chat' here gave every bot its own window and hid exactly the errors the user needed.
describe('openBotConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state = makeState()
  })

  it('reveals a live session pane without launching', async () => {
    const { openBotConversation } = await import('./open-bot-conversation')

    const result = await openBotConversation('bot1')

    expect(result).toEqual({
      ok: true,
      worktreeId: 'repo1::/wt',
      tabId: 'tab1',
      launched: false
    })
    expect(startBotSession).not.toHaveBeenCalled()
    expect(setActiveTabForWorktree).toHaveBeenCalledWith('repo1::/wt', 'tab1')
    expect(setTabViewMode).toHaveBeenCalledWith('tab1', 'terminal')
  })

  it('starts a session and reveals the pane the launch reported', async () => {
    state = makeState({ bots: [{ ...bot, chatPaneKey: null }] })
    startBotSession.mockResolvedValue(STARTED_PANE_KEY)
    const { openBotConversation } = await import('./open-bot-conversation')

    const result = await openBotConversation('bot1')

    expect(result).toMatchObject({ ok: true, tabId: 'tab2', launched: true })
    // Not re-resolved from state: the agent has not filed its first status yet.
    expect(setTabViewMode).toHaveBeenCalledWith('tab2', 'terminal')
  })

  it('refuses a folder-bound bot instead of opening a dead pane', async () => {
    state = makeState({ bots: [{ ...bot, workspaceKey: 'folder:/some/dir' }] })
    const { openBotConversation } = await import('./open-bot-conversation')

    expect(await openBotConversation('bot1')).toEqual({ ok: false, reason: 'folder_workspace' })
    expect(toastError).toHaveBeenCalled()
    expect(setTabViewMode).not.toHaveBeenCalled()
  })

  it('reports a launch that never produced a pane', async () => {
    state = makeState({ bots: [{ ...bot, chatPaneKey: null }] })
    startBotSession.mockResolvedValue(null)
    const { openBotConversation } = await import('./open-bot-conversation')

    expect(await openBotConversation('bot1')).toEqual({ ok: false, reason: 'launch_failed' })
    expect(toastError).toHaveBeenCalled()
    expect(setTabViewMode).not.toHaveBeenCalled()
  })
})

import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../../shared/agent-status-types'
import {
  findLiveBotChatSession,
  getBotActivityState,
  getBotLatestReply,
  type BotChatSessionState
} from './bot-chat-session'

// A real UUID: parsePaneKey rejects anything else, which is the durable-leaf contract the
// binding depends on (src/shared/stable-pane-id.ts).
const LEAF_ID = '1f0a4c2e-9b71-4d33-8e05-6c7a2b91d4f8'
const PANE_KEY = `tab1:${LEAF_ID}`

function makeState(overrides: Partial<BotChatSessionState> = {}): BotChatSessionState {
  return {
    agentStatusByPaneKey: {
      [PANE_KEY]: { state: 'done', agentType: 'claude' } as AgentStatusEntry
    },
    ptyIdsByTabId: { tab1: ['pty1'] },
    terminalLayoutsByTabId: { tab1: { ptyIdsByLeafId: { [LEAF_ID]: 'pty1' } } },
    unifiedTabsByWorktree: { wt1: [{ contentType: 'terminal', entityId: 'tab1' }] },
    ...overrides
  } as BotChatSessionState
}

const args = (state: BotChatSessionState, chatPaneKey: string | null = PANE_KEY) => ({
  chatPaneKey,
  botName: 'Release Checker',
  worktreeId: 'wt1',
  agentId: 'claude' as const,
  state
})

describe('findLiveBotChatSession', () => {
  it('resolves a live pane to its current pty', () => {
    expect(findLiveBotChatSession(args(makeState()))).toEqual({
      tabId: 'tab1',
      leafId: LEAF_ID,
      ptyId: 'pty1',
      paneKey: PANE_KEY,
      idle: true
    })
  })

  // The chat may send to a busy agent — a person typing a follow-up mid-turn is normal.
  // Only the flag changes; the session is still the one to send to.
  it('still resolves a working session, flagged as not idle', () => {
    const state = makeState({
      agentStatusByPaneKey: {
        [PANE_KEY]: { state: 'working', agentType: 'claude' } as AgentStatusEntry
      }
    })
    expect(findLiveBotChatSession(args(state))?.idle).toBe(false)
  })

  it('returns null when the bot has never been messaged and no titled session exists', () => {
    expect(findLiveBotChatSession(args(makeState(), null))).toBeNull()
  })

  it('returns null when the pane key is malformed', () => {
    expect(findLiveBotChatSession(args(makeState(), 'not-a-pane-key'))).toBeNull()
  })

  // The daemon could not keep the PTY: the binding must read as "gone" so the next message
  // opens a fresh session instead of pasting into nothing.
  it('returns null when the pty is no longer registered on the tab', () => {
    expect(findLiveBotChatSession(args(makeState({ ptyIdsByTabId: { tab1: [] } })))).toBeNull()
  })

  it('returns null when the leaf now holds a different pty', () => {
    // Only the field this module reads is modelled; a full TerminalLayoutSnapshot would add
    // root/activeLeafId noise the resolver never touches.
    const state = makeState({
      terminalLayoutsByTabId: {
        tab1: { ptyIdsByLeafId: { [LEAF_ID]: 'pty2' } }
      } as unknown as BotChatSessionState['terminalLayoutsByTabId']
    })
    expect(findLiveBotChatSession(args(state))).toBeNull()
  })

  it('returns null when the tab left this workspace', () => {
    expect(
      findLiveBotChatSession(args(makeState({ unifiedTabsByWorktree: { wt1: [] } })))
    ).toBeNull()
  })

  it('returns null when the pane now runs a different agent', () => {
    const state = makeState({
      agentStatusByPaneKey: {
        [PANE_KEY]: { state: 'done', agentType: 'codex' } as AgentStatusEntry
      }
    })
    expect(findLiveBotChatSession(args(state))).toBeNull()
  })

  // A pane whose agent has not reported yet is still this bot's session; refusing it would
  // orphan a conversation the user can plainly see running.
  it('accepts a pane whose agent identity is not reported yet', () => {
    const state = makeState({
      agentStatusByPaneKey: { [PANE_KEY]: { state: 'done' } as AgentStatusEntry }
    })
    expect(findLiveBotChatSession(args(state))?.paneKey).toBe(PANE_KEY)
  })
})

// The recovery that makes a restart survivable: tab ids change, the bot: title does not.
describe('findLiveBotChatSession — title recovery', () => {
  const titledState = (): BotChatSessionState =>
    ({
      agentStatusByPaneKey: {
        [PANE_KEY]: { state: 'done', agentType: 'claude' } as AgentStatusEntry
      },
      ptyIdsByTabId: { tab1: ['pty1'] },
      terminalLayoutsByTabId: { tab1: { ptyIdsByLeafId: { [LEAF_ID]: 'pty1' } } },
      unifiedTabsByWorktree: {
        wt1: [
          {
            contentType: 'terminal',
            entityId: 'tab1',
            customLabel: 'bot:release-checker',
            label: 'zsh'
          }
        ]
      }
    }) as unknown as BotChatSessionState

  it('finds the session by its bot: title when the stored key is stale', () => {
    const found = findLiveBotChatSession({
      chatPaneKey: 'deadtab:11111111-2222-4333-8444-555555555555',
      botName: 'Release Checker',
      worktreeId: 'wt1',
      agentId: 'claude',
      state: titledState()
    })
    // The healed key is the live one, which the caller persists.
    expect(found?.paneKey).toBe(PANE_KEY)
  })

  it('finds it with no stored key at all', () => {
    expect(
      findLiveBotChatSession({
        chatPaneKey: null,
        botName: 'Release Checker',
        worktreeId: 'wt1',
        agentId: 'claude',
        state: titledState()
      })?.paneKey
    ).toBe(PANE_KEY)
  })

  it('does not adopt another bot’s titled session', () => {
    expect(
      findLiveBotChatSession({
        chatPaneKey: null,
        botName: 'Code Reviewer',
        worktreeId: 'wt1',
        agentId: 'claude',
        state: titledState()
      })
    ).toBeNull()
  })
})

describe('getBotLatestReply', () => {
  it('prefers the live message and falls back to the last completed turn', () => {
    const state = {
      agentStatusByPaneKey: {
        [PANE_KEY]: {
          state: 'done',
          lastAssistantMessage: '  done  ',
          lastCompletedAssistantMessage: 'older'
        } as AgentStatusEntry
      }
    }
    expect(getBotLatestReply(state, PANE_KEY)).toBe('done')

    const batched = {
      agentStatusByPaneKey: {
        [PANE_KEY]: {
          state: 'working',
          lastCompletedAssistantMessage: 'older'
        } as AgentStatusEntry
      }
    }
    expect(getBotLatestReply(batched, PANE_KEY)).toBe('older')
  })

  it('returns null for no pane, no entry, or a blank message', () => {
    const blank = {
      agentStatusByPaneKey: {
        [PANE_KEY]: { state: 'done', lastAssistantMessage: '   ' } as AgentStatusEntry
      }
    }
    expect(getBotLatestReply(blank, PANE_KEY)).toBeNull()
    expect(getBotLatestReply(blank, null)).toBeNull()
    expect(getBotLatestReply({ agentStatusByPaneKey: {} }, PANE_KEY)).toBeNull()
  })
})

describe('getBotActivityState', () => {
  it('maps a session to the three states the roster shows', () => {
    expect(getBotActivityState(null)).toBe('no-session')
    expect(
      getBotActivityState({
        tabId: 't',
        leafId: LEAF_ID,
        ptyId: 'p',
        paneKey: PANE_KEY,
        idle: true
      })
    ).toBe('idle')
    expect(
      getBotActivityState({
        tabId: 't',
        leafId: LEAF_ID,
        ptyId: 'p',
        paneKey: PANE_KEY,
        idle: false
      })
    ).toBe('working')
  })
})

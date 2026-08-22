import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../../shared/agent-status-types'
import type { Bot } from '../../../../../shared/bot-types'
import type { BotChatEntry } from '@/store/slices/bot-chat'
import { buildBotRosterActivity } from './bot-roster-activity'
import type { BotChatSessionState } from './bot-chat-session'

const LEAF_A = '1f0a4c2e-9b71-4d33-8e05-6c7a2b91d4f8'
const LEAF_B = '2a1b5d3f-8c62-4e44-9f16-7d8b3ca02e59'
const PANE_A = `tabA:${LEAF_A}`
const PANE_B = `tabB:${LEAF_B}`

const makeBot = (overrides: Partial<Bot> = {}): Bot => ({
  id: 'a',
  name: 'A',
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

const botA = makeBot({ id: 'a', name: 'A', chatPaneKey: PANE_A })
const botB = makeBot({ id: 'b', name: 'B', chatPaneKey: PANE_B })

function makeState(states: Record<string, AgentStatusEntry['state']>): BotChatSessionState {
  return {
    agentStatusByPaneKey: Object.fromEntries(
      Object.entries(states).map(([paneKey, state]) => [
        paneKey,
        { state, agentType: 'claude' } as AgentStatusEntry
      ])
    ),
    ptyIdsByTabId: { tabA: ['ptyA'], tabB: ['ptyB'] },
    terminalLayoutsByTabId: {
      tabA: { ptyIdsByLeafId: { [LEAF_A]: 'ptyA' } },
      tabB: { ptyIdsByLeafId: { [LEAF_B]: 'ptyB' } }
    },
    unifiedTabsByWorktree: {
      'r1::/wt': [
        { contentType: 'terminal', entityId: 'tabA' },
        { contentType: 'terminal', entityId: 'tabB' }
      ]
    }
  } as unknown as BotChatSessionState
}

const handoff = (toBotId: string): BotChatEntry[] => [
  { id: 'e1', kind: 'relayed-out', text: 'take this', counterpartBotId: toBotId, at: 1 }
]

describe('buildBotRosterActivity', () => {
  it('reports working, idle, and offline from the live session', () => {
    const offline = makeBot({ id: 'c', name: 'C', chatPaneKey: null })
    expect(
      buildBotRosterActivity({
        bots: [botA, botB, offline],
        chatLog: {},
        state: makeState({ [PANE_A]: 'working', [PANE_B]: 'done' })
      })
    ).toEqual({ a: 'working', b: 'idle', c: 'offline' })
  })

  it('reports offline for a bot with no workspace, which can never have a session', () => {
    const unbound = makeBot({ id: 'u', workspaceKey: null, projectId: null })
    expect(buildBotRosterActivity({ bots: [unbound], chatLog: {}, state: makeState({}) }).u).toBe(
      'offline'
    )
  })

  // The reason a person looks at the roster: A finished its turn and is blocked on B.
  it('marks a bot waiting when the teammate it handed work to is still running', () => {
    expect(
      buildBotRosterActivity({
        bots: [botA, botB],
        chatLog: { a: handoff('b') },
        state: makeState({ [PANE_A]: 'done', [PANE_B]: 'working' })
      })
    ).toEqual({ a: 'waiting', b: 'working' })
  })

  it('stops waiting once the teammate is done', () => {
    expect(
      buildBotRosterActivity({
        bots: [botA, botB],
        chatLog: { a: handoff('b') },
        state: makeState({ [PANE_A]: 'done', [PANE_B]: 'done' })
      }).a
    ).toBe('idle')
  })

  // A bot mid-turn is working, not waiting, even if it delegated a moment ago.
  it('keeps a busy bot on working rather than waiting', () => {
    expect(
      buildBotRosterActivity({
        bots: [botA, botB],
        chatLog: { a: handoff('b') },
        state: makeState({ [PANE_A]: 'working', [PANE_B]: 'working' })
      }).a
    ).toBe('working')
  })

  // Only the LAST entry counts: an older handoff that was already answered and followed by
  // more conversation is not something this bot is still blocked on.
  it('ignores a handoff that is no longer the latest entry', () => {
    const log: BotChatEntry[] = [
      ...handoff('b'),
      { id: 'e2', kind: 'sent', text: 'never mind, I did it', at: 2 }
    ]
    expect(
      buildBotRosterActivity({
        bots: [botA, botB],
        chatLog: { a: log },
        state: makeState({ [PANE_A]: 'done', [PANE_B]: 'working' })
      }).a
    ).toBe('idle')
  })

  it('does not mark a bot waiting on an offline teammate', () => {
    const offlineTarget = makeBot({ id: 'b', name: 'B', chatPaneKey: null })
    expect(
      buildBotRosterActivity({
        bots: [botA, offlineTarget],
        chatLog: { a: handoff('b') },
        state: makeState({ [PANE_A]: 'done' })
      }).a
    ).toBe('idle')
  })
})

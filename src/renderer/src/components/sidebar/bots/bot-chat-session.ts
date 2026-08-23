// Resolving "the pane that holds this bot's conversation".
//
// Orca has no conversation store — a transcript belongs to the agent CLI that wrote it. So a
// bot's canonical chat is a pinned PANE, and this module answers the one question the chat
// surface asks: is that pane still a live session of this bot's agent, or does the next
// message have to open a new one?
//
// The liveness rules mirror automation session reuse deliberately: same failure modes, same
// answers. What differs is that a chat may send to a WORKING agent — a person typing a
// follow-up mid-turn is normal, while a scheduled run must not stack on top of one.

import type { AgentStatusEntry } from '../../../../../shared/agent-status-types'
import { makePaneKey, parsePaneKey } from '../../../../../shared/stable-pane-id'
import type { TuiAgent } from '../../../../../shared/tui-agent'
import type { AppState } from '@/store/types'
import { botSessionTitle } from './bot-message-routing'

export type BotChatSession = {
  tabId: string
  leafId: string
  ptyId: string
  paneKey: string
  /** False while the agent is mid-turn; the message still goes through, the UI just says so. */
  idle: boolean
}

export type BotChatSessionState = Pick<
  AppState,
  'agentStatusByPaneKey' | 'ptyIdsByTabId' | 'terminalLayoutsByTabId' | 'unifiedTabsByWorktree'
>

// A missing entry is accepted, unlike automation session reuse. Both lookups that reach here
// are already bot-owned — the pane key this bot stored, or a pane titled bot:<handle> — and a
// freshly launched agent has not reported status yet. Refusing it would make the session
// invisible for the first seconds: the reveal button would not appear and the next message
// would launch a duplicate beside it.
function isSameAgent(entry: AgentStatusEntry | undefined, agentId: TuiAgent): boolean {
  if (!entry) {
    return true
  }
  return !entry.agentType || entry.agentType === 'unknown' || entry.agentType === agentId
}

function resolvePaneKey(args: {
  paneKey: string
  worktreeId: string
  agentId: TuiAgent
  state: BotChatSessionState
}): BotChatSession | null {
  const { paneKey, worktreeId, agentId, state } = args
  const parsed = parsePaneKey(paneKey)
  if (!parsed) {
    return null
  }
  const worktreeTabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  const isTerminalTabHere = worktreeTabs.some(
    (tab) => tab.contentType === 'terminal' && tab.entityId === parsed.tabId
  )
  if (!isTerminalTabHere) {
    return null
  }
  const ptyId = state.terminalLayoutsByTabId[parsed.tabId]?.ptyIdsByLeafId?.[parsed.leafId]
  if (!ptyId || !state.ptyIdsByTabId[parsed.tabId]?.includes(ptyId)) {
    return null
  }
  const entry = state.agentStatusByPaneKey[paneKey]
  if (!isSameAgent(entry, agentId)) {
    return null
  }
  return {
    tabId: parsed.tabId,
    leafId: parsed.leafId,
    ptyId,
    paneKey,
    idle: entry?.state === 'done'
  }
}

/**
 * A live session found by the tab title this bot's sessions carry (`bot:<handle>`).
 *
 * Why a second lookup exists: an app restart re-creates tabs with new ids, so a stored pane
 * key goes stale even when the daemon kept the PTY alive and the user is looking straight at
 * the running session. Without this the bot loses a conversation that is plainly still there,
 * and the next message opens a duplicate beside it.
 *
 * The title is the same key teammates discover each other by, so recovery and discovery
 * cannot drift apart.
 */
function findBotSessionByTitle(args: {
  botName: string
  worktreeId: string
  agentId: TuiAgent
  state: BotChatSessionState
  sessionTitle?: string
}): BotChatSession | null {
  const { botName, worktreeId, agentId, state } = args
  const title = args.sessionTitle ?? botSessionTitle({ name: botName })
  const candidates = (state.unifiedTabsByWorktree[worktreeId] ?? []).filter(
    (tab) => tab.contentType === 'terminal' && (tab.customLabel === title || tab.label === title)
  )
  for (const tab of candidates) {
    const layout = state.terminalLayoutsByTabId[tab.entityId]?.ptyIdsByLeafId ?? {}
    for (const [leafId, ptyId] of Object.entries(layout)) {
      if (!ptyId) {
        continue
      }
      const session = resolvePaneKey({
        paneKey: makePaneKey(tab.entityId, leafId),
        worktreeId,
        agentId,
        state
      })
      if (session) {
        return session
      }
    }
  }
  return null
}

/**
 * The bot's live conversation pane, or null when the next message must launch a new one.
 *
 * Two lookups, in order: the stored pane key, then the session title. Returns null rather
 * than throwing for every miss — an absent, closed, reassigned, or different-agent pane are
 * all the same instruction to the caller.
 *
 * When the title lookup wins, the returned `paneKey` differs from the stored one; callers
 * persist it so the binding heals instead of re-searching on every render.
 */
export function findLiveBotChatSession(args: {
  chatPaneKey: string | null
  botName: string
  worktreeId: string
  agentId: TuiAgent
  state: BotChatSessionState
  /** Overrides the title recovery key. A group room's member session carries the room id, so
   *  it must not be re-adopted as that bot's 1:1 conversation (or vice versa). */
  sessionTitle?: string
}): BotChatSession | null {
  const { chatPaneKey, botName, worktreeId, agentId, state, sessionTitle } = args
  const bound = chatPaneKey
    ? resolvePaneKey({ paneKey: chatPaneKey, worktreeId, agentId, state })
    : null
  return bound ?? findBotSessionByTitle({ botName, worktreeId, agentId, state, sessionTitle })
}

/** The bot's newest reply, for the chat surface. Falls back to the last completed turn. */
export function getBotLatestReply(
  state: Pick<AppState, 'agentStatusByPaneKey'>,
  chatPaneKey: string | null
): string | null {
  if (!chatPaneKey) {
    return null
  }
  const entry = state.agentStatusByPaneKey[chatPaneKey]
  // Why both: a batched publication can fold a whole done→working turn into one
  // notification, clearing lastAssistantMessage before any subscriber observed it.
  const message = entry?.lastAssistantMessage ?? entry?.lastCompletedAssistantMessage
  const trimmed = message?.trim()
  return trimmed ? trimmed : null
}

export type BotActivityState = 'no-session' | 'working' | 'idle'

export function getBotActivityState(session: BotChatSession | null): BotActivityState {
  if (!session) {
    return 'no-session'
  }
  return session.idle ? 'idle' : 'working'
}

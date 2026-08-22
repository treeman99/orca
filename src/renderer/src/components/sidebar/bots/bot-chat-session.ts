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
import { parsePaneKey } from '../../../../../shared/stable-pane-id'
import type { TuiAgent } from '../../../../../shared/tui-agent'
import type { AppState } from '@/store/types'

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

function isSameAgent(entry: AgentStatusEntry | undefined, agentId: TuiAgent): boolean {
  if (!entry) {
    return false
  }
  // `unknown` covers a pane whose agent identity has not been reported yet; refusing it would
  // orphan a session the user can plainly see running.
  return !entry.agentType || entry.agentType === 'unknown' || entry.agentType === agentId
}

/**
 * The bot's live conversation pane, or null when the next message must launch a new one.
 *
 * Returns null rather than throwing for every miss — an absent, closed, reassigned, or
 * different-agent pane are all the same instruction to the caller.
 */
export function findLiveBotChatSession(args: {
  chatPaneKey: string | null
  worktreeId: string
  agentId: TuiAgent
  state: BotChatSessionState
}): BotChatSession | null {
  const { chatPaneKey, worktreeId, agentId, state } = args
  if (!chatPaneKey) {
    return null
  }
  const parsed = parsePaneKey(chatPaneKey)
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
  const entry = state.agentStatusByPaneKey[chatPaneKey]
  if (!isSameAgent(entry, agentId)) {
    return null
  }
  return {
    tabId: parsed.tabId,
    leafId: parsed.leafId,
    ptyId,
    paneKey: chatPaneKey,
    idle: entry?.state === 'done'
  }
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

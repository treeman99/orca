// Revealing a bot's SESSION, from wherever the gesture came from.
//
// Two callers with the same contract: the roster's double-click, and the `+` menu's bot rows
// in the tab bar. Extracted so both land on the same pane in the same view.
//
// The mode is set every time, not just on launch: the tab persists `viewMode`, so a pane the
// user toggled by hand comes back to its session view when they open the bot again.

import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { parsePaneKey } from '../../../../../shared/stable-pane-id'
import { getBotRoutineEligibility } from '../../../../../shared/bot-types'
import { findLiveBotChatSession } from './bot-chat-session'

export type OpenBotConversationResult =
  | { ok: true; worktreeId: string; tabId: string; launched: boolean }
  | { ok: false; reason: 'missing' | 'folder_workspace' | 'unbound' | 'launch_failed' }

function reveal(worktreeId: string, tabId: string): void {
  const store = useAppStore.getState()
  store.setActiveWorktree(worktreeId)
  store.setActiveTabForWorktree(worktreeId, tabId)
  // A bot's own pane is its SESSION, and a session is a terminal.
  //
  // This used to force 'chat' here, which gave every bot its own chat window: N bots meant N
  // chats, none of which showed what the others were doing, and a delegation failure surfaced
  // as one bot going quiet in its own window. A room (Rooms in the Bots lane) is the chat
  // surface — one ordered log over several bots, composed from what their sessions report —
  // and this pane is where the raw agent output lives, which is where an error is actually
  // legible. Nothing is lost: the pane can still be toggled to chat by hand.
  store.setTabViewMode(tabId, 'terminal')
}

/**
 * Reveal `botId`'s conversation in chat, starting a session when it has none.
 *
 * Toasts here rather than at the call sites: every failure is the same sentence wherever the
 * gesture came from, and a silent no-op is what a double-click on an unbound bot used to be.
 */
export async function openBotConversation(botId: string): Promise<OpenBotConversationResult> {
  const bot = useAppStore.getState().bots.find((entry) => entry.id === botId)
  if (!bot) {
    return { ok: false, reason: 'missing' }
  }
  const eligibility = getBotRoutineEligibility(bot)
  if (!eligibility.ok) {
    toast.error(
      eligibility.reason === 'folder_workspace'
        ? translate(
            'auto.components.sidebar.bots.BotsPanel.c62f019b4e',
            'That bot is bound to a folder workspace, which cannot run an agent.'
          )
        : translate(
            'auto.components.sidebar.bots.BotsPanel.19d0b7e3ca',
            'That bot has no workspace yet.'
          )
    )
    return {
      ok: false,
      reason: eligibility.reason === 'folder_workspace' ? 'folder_workspace' : 'unbound'
    }
  }
  const { worktreeId } = eligibility
  const live = findLiveBotChatSession({
    chatPaneKey: bot.chatPaneKey,
    botName: bot.name,
    worktreeId,
    agentId: bot.agentId,
    state: useAppStore.getState()
  })
  if (live) {
    reveal(worktreeId, live.tabId)
    return { ok: true, worktreeId, tabId: live.tabId, launched: false }
  }
  const startedPaneKey = await useAppStore.getState().startBotSession(botId)
  const started = startedPaneKey ? parsePaneKey(startedPaneKey) : null
  if (!started) {
    toast.error(
      translate(
        'auto.components.sidebar.bots.BotsPanel.4a8c17f0d3',
        'Could not reach that bot’s session.'
      )
    )
    return { ok: false, reason: 'launch_failed' }
  }
  // Reveal the pane the launch reported, not one re-resolved from state: the agent has not
  // filed its first status yet, and waiting for it would make the gesture look dead.
  reveal(worktreeId, started.tabId)
  return { ok: true, worktreeId, tabId: started.tabId, launched: true }
}

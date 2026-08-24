// Revealing a bot's conversation, from wherever the gesture came from.
//
// Two callers with the same contract: the roster's double-click, and the `+` menu's bot
// section in the tab bar. Extracted because the second one is what makes the split honest —
// a SESSION launched from `+` is always a terminal, so the chat view has to be reachable
// from the same menu or it only exists in the sidebar.
//
// Chat mode is set on the pane every time, not just on launch: the tab persists `viewMode`,
// so a bot pane a user toggled to terminal comes back as a chat when they open it from the
// roster again.

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
  // A bot conversation reads as a chat, not a terminal — the transcript view is what the
  // sidebar thread is an index into.
  store.setTabViewMode(tabId, 'chat')
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

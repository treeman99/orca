// Getting a message into a bot's conversation.
//
// Two paths, one contract: if the bot's pinned pane is still a live session, paste into it;
// otherwise launch a background agent session in the bot's workspace and hand the message to
// it as the launch prompt. Either way the caller learns the pane key so the binding follows
// the bot instead of the message.
//
// Background, not a foreground tab: a bot answering a routine or a teammate must not yank the
// user out of whatever they were doing. The pane is a real terminal tab they can reveal.

import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { submitPromptToAgentPty } from '@/lib/agent-paste-draft'
import { useAppStore } from '@/store'
import { getBotRoutineEligibility, type Bot } from '../../../../../shared/bot-types'
import { findLiveBotChatSession } from './bot-chat-session'
import { botSessionTitle, buildBotTeammatePreamble } from './bot-message-routing'

export type BotDeliveryResult =
  | { ok: true; paneKey: string; launched: boolean }
  | { ok: false; reason: 'unbound' | 'folder_workspace' | 'launch_failed'; message?: string }

/**
 * Deliver `text` to `bot`, launching its conversation if it does not have a live one.
 *
 * A folder-bound bot is refused for the same reason routines are: the launcher resolves its
 * target through worktree ids and has no folder path to run in.
 */
export async function deliverToBot(args: {
  bot: Bot
  text: string
  roster: readonly Bot[]
}): Promise<BotDeliveryResult> {
  const { bot, text, roster } = args
  const eligibility = getBotRoutineEligibility(bot)
  if (!eligibility.ok) {
    return {
      ok: false,
      reason: eligibility.reason === 'folder_workspace' ? 'folder_workspace' : 'unbound'
    }
  }
  const worktreeId = eligibility.worktreeId
  const state = useAppStore.getState()
  const existing = findLiveBotChatSession({
    chatPaneKey: bot.chatPaneKey,
    botName: bot.name,
    worktreeId,
    agentId: bot.agentId,
    state
  })

  if (existing) {
    const delivered = await submitPromptToAgentPty({
      tabId: existing.tabId,
      ptyId: existing.ptyId,
      content: text
    })
    if (!delivered) {
      return { ok: false, reason: 'launch_failed' }
    }
    return { ok: true, paneKey: existing.paneKey, launched: false }
  }

  // First message of a conversation carries the roster: the agent has to know who its
  // teammates are before it can decide to hand anything off.
  const preamble = buildBotTeammatePreamble({ self: bot, roster })
  const prompt = preamble ? `${preamble}\n\n---\n\n${text}` : text
  try {
    const result = await launchAgentBackgroundSession({
      agent: bot.agentId,
      worktreeId,
      prompt,
      title: botSessionTitle(bot),
      launchSource: 'sidebar'
    })
    if (!result) {
      return { ok: false, reason: 'launch_failed' }
    }
    return { ok: true, paneKey: result.paneKey, launched: true }
  } catch (error) {
    return {
      ok: false,
      reason: 'launch_failed',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

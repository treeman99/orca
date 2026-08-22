// What each roster row shows about a bot right now.
//
// Two states earn an icon, because they are the two reasons a person would want to look:
// the bot is mid-turn, or it finished its turn and is blocked on a teammate it handed work
// to. Idle and offline get nothing — a roster where every row carries a badge tells you
// nothing at a glance.

import { getBotRoutineEligibility, type Bot } from '../../../../../shared/bot-types'
import type { BotChatEntry } from '@/store/slices/bot-chat'
import { findLiveBotChatSession, type BotChatSessionState } from './bot-chat-session'

export type BotRosterActivity =
  /** Live session, agent mid-turn. */
  | 'working'
  /** Its own turn is done, and a teammate it handed work to is still running. */
  | 'waiting'
  /** Live session, nothing running. */
  | 'idle'
  /** No live session at all. */
  | 'offline'

function resolveOwnActivity(bot: Bot, state: BotChatSessionState): BotRosterActivity {
  const eligibility = getBotRoutineEligibility(bot)
  if (!eligibility.ok) {
    return 'offline'
  }
  const session = findLiveBotChatSession({
    chatPaneKey: bot.chatPaneKey,
    botName: bot.name,
    worktreeId: eligibility.worktreeId,
    agentId: bot.agentId,
    state
  })
  if (!session) {
    return 'offline'
  }
  return session.idle ? 'idle' : 'working'
}

/** The bot this one most recently handed work to, or null. */
function lastHandoffTargetId(entries: readonly BotChatEntry[] | undefined): string | null {
  const last = entries?.at(-1)
  return last?.kind === 'relayed-out' ? (last.counterpartBotId ?? null) : null
}

/**
 * Activity for every bot, in one pass over the roster.
 *
 * The handoff check runs second and only over bots that are otherwise `idle`: a bot that is
 * itself mid-turn is working, not waiting, even if it delegated a moment ago. "Waiting" means
 * this bot has nothing left to do until its teammate answers.
 */
export function buildBotRosterActivity(args: {
  bots: readonly Bot[]
  chatLog: Readonly<Record<string, BotChatEntry[]>>
  state: BotChatSessionState
}): Record<string, BotRosterActivity> {
  const activity: Record<string, BotRosterActivity> = {}
  for (const bot of args.bots) {
    activity[bot.id] = resolveOwnActivity(bot, args.state)
  }
  for (const bot of args.bots) {
    if (activity[bot.id] !== 'idle') {
      continue
    }
    const targetId = lastHandoffTargetId(args.chatLog[bot.id])
    if (targetId && activity[targetId] === 'working') {
      activity[bot.id] = 'waiting'
    }
  }
  return activity
}

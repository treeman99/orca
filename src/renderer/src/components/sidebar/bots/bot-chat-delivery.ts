// Getting a message into a bot's conversation, and making sure its teammates exist first.
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
import { getProjectTeammates } from './bot-roster-groups'

export type BotDeliveryResult =
  | { ok: true; paneKey: string; launched: boolean }
  | { ok: false; reason: 'unbound' | 'folder_workspace' | 'launch_failed'; message?: string }

/**
 * Cap on how many teammates one message may wake.
 *
 * Each one is a real agent process against the user's quota. A roster large enough to exceed
 * this is a roster the coordinator should be told about rather than silently spawned.
 */
const MAX_TEAMMATE_AUTOSTART = 6

function findSession(bot: Bot, worktreeId: string) {
  return findLiveBotChatSession({
    chatPaneKey: bot.chatPaneKey,
    botName: bot.name,
    worktreeId,
    agentId: bot.agentId,
    state: useAppStore.getState()
  })
}

/**
 * Start a bot's session with nothing to do yet, so a teammate can find it.
 *
 * The prompt is the roster preamble alone: the bot learns who it is and who its teammates are,
 * and is told to wait. Without this an auto-started teammate would sit at a bare prompt with
 * no idea it is a bot.
 */
export async function startBotStandbySession(
  bot: Bot,
  roster: readonly Bot[]
): Promise<string | null> {
  const eligibility = getBotRoutineEligibility(bot)
  if (!eligibility.ok) {
    return null
  }
  const preamble = buildBotTeammatePreamble({ self: bot, roster })
  const standby = [
    preamble,
    preamble ? '---' : null,
    `You are on standby. A teammate may hand you work; until then, do nothing and wait.`
  ]
    .filter((line) => line !== null)
    .join('\n\n')
  try {
    const result = await launchAgentBackgroundSession({
      agent: bot.agentId,
      worktreeId: eligibility.worktreeId,
      prompt: standby,
      title: botSessionTitle(bot),
      launchSource: 'sidebar'
    })
    return result?.paneKey ?? null
  } catch {
    // Best effort: a teammate that will not start is reported by the coordinator, which the
    // preamble tells it to do rather than quietly absorbing the work.
    return null
  }
}

export type TeammateStartResult = { botId: string; paneKey: string }

/**
 * Bring up every same-project teammate that has no live session.
 *
 * Why Orca does this instead of leaving it to the coordinator: a bot only gets a terminal once
 * someone messages it, so on a fresh roster the coordinator looks for teammates, finds none,
 * and correctly concludes it has nobody to delegate to. Making the roster true before the
 * coordinator reads it is the fix; telling the agent to go create terminals is the fallback.
 */
export async function ensureProjectTeammateSessions(args: {
  bot: Bot
  roster: readonly Bot[]
}): Promise<TeammateStartResult[]> {
  const teammates = getProjectTeammates(args.bot, args.roster)
  const pending = teammates
    .filter((teammate) => {
      const eligibility = getBotRoutineEligibility(teammate)
      return eligibility.ok && !findSession(teammate, eligibility.worktreeId)
    })
    .slice(0, MAX_TEAMMATE_AUTOSTART)
  if (pending.length === 0) {
    return []
  }
  const started = await Promise.all(
    pending.map(async (teammate) => {
      const paneKey = await startBotStandbySession(teammate, args.roster)
      return paneKey ? { botId: teammate.id, paneKey } : null
    })
  )
  return started.filter((entry): entry is TeammateStartResult => entry !== null)
}

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
  const existing = findSession(bot, worktreeId)

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

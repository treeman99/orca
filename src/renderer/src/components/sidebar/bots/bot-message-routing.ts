// Addressing one bot from another's chat, and the teammate roster a bot session is told about.
//
// Hermes gives a bot a `message_agent` tool and puts the roster in every Bot Chat's system
// prompt. Orca has no tool-injection seam, so the same two halves land differently:
//
//   - the ADDRESS half is `@handle` in the composer, resolved here and delivered to the
//     target bot's own pane with the sender attributed;
//   - the DISCOVERY half is a preamble on the bot's first launch that names the teammates
//     and the exact `orca` commands to reach them, so the agent can hand off on its own
//     without a new RPC.
//
// Both are plain text over paths that already exist. Nothing here needs a wire change.

import { botHandle, type Bot } from '../../../../../shared/bot-types'
import { getProjectTeammates } from './bot-roster-groups'

export type BotMention = {
  /** The addressed bot, or null when the leading @handle matches nobody. */
  target: Bot | null
  /** The raw handle the author typed, for the "no such bot" message. */
  handle: string
  /** The message with the leading mention removed. */
  body: string
}

const LEADING_MENTION = /^@([^\s@]+)\s*([\s\S]*)$/

/**
 * Parse a leading `@handle` off a composer message.
 *
 * Only a LEADING mention routes. A mention mid-sentence is prose the author wants the
 * current bot to read — silently redirecting it would lose the message.
 */
export function parseBotMention(text: string, bots: readonly Bot[]): BotMention | null {
  const match = LEADING_MENTION.exec(text.trim())
  if (!match) {
    return null
  }
  const handle = match[1].toLowerCase()
  const body = match[2].trim()
  const target =
    bots.find((bot) => botHandle(bot.name) === handle) ??
    // Hermes keeps a renamed bot reachable by its spaceless form too.
    bots.find((bot) => botHandle(bot.name).replace(/-/g, '') === handle.replace(/-/g, '')) ??
    null
  return { target, handle, body }
}

/**
 * A message from one bot to another, attributed.
 *
 * The attribution is not decoration: without it the receiving agent reads the text as if the
 * user typed it and answers the wrong party.
 */
export function formatBotToBotMessage(args: { fromBot: Bot; body: string }): string {
  return `Message from 🤖 ${args.fromBot.name} (@${botHandle(args.fromBot.name)}):\n\n${args.body}`
}

/**
 * Everything a bot session is told about itself when it starts.
 *
 * Three parts, and the order matters: who you are, the standing instructions you were created
 * with, then who you can hand work to.
 *
 * Why this is never null, unlike the teammate section it replaced: a bot with no teammates was
 * getting NO preamble at all, so its name, its job, and its description never reached the
 * agent. The user filled those fields in and the bot behaved as a generic assistant.
 */
export function buildBotSessionPreamble(args: { self: Bot; roster: readonly Bot[] }): string {
  return [buildBotRoleBlock(args.self), ...buildTeammateSection(args)]
    .filter((line) => line !== null)
    .join('\n')
}

/**
 * Who this bot is and what it was told to do — without the delegation recipe.
 *
 * Split out because a scheduled routine needs the role but not the teammate section: it runs
 * one prompt on a timer, and the recipe is several lines of shell that would dominate it.
 */
export function buildBotRoleBlock(bot: Bot): string {
  const description = bot.description.trim()
  return [
    `You are the Orca bot "${bot.name}" (@${botHandle(bot.name)}).`,
    bot.title.trim() ? `Your job: ${bot.title.trim()}` : null,
    // Framed as standing instructions rather than a bio: the description is where a user
    // writes scope ("only look in this repo", "read this page first"), and a bio would read
    // as background the agent may drop once it gets a concrete request.
    ...(description
      ? [
          '',
          'Standing instructions from the person who created you. They apply on every turn,',
          'including work handed to you by a teammate or started on a schedule. If one of them',
          'conflicts with a request, say so rather than silently ignoring it:',
          '',
          description
        ]
      : [])
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/**
 * The teammate half of the preamble, or nothing when this bot works alone.
 *
 * Named terminals are the whole mechanism: every bot conversation runs in a terminal titled
 * `bot:<handle>`, so `orca terminal list` finds a teammate and `orca terminal create` with
 * that title STARTS one that is not running yet. Orca's own roster discovers sessions by the
 * same title, so a teammate the agent starts this way is adopted as that bot's conversation
 * rather than becoming an orphan terminal.
 *
 * Why the create step is spelled out: a bot only gets a terminal once someone messages it, so
 * on a fresh roster most teammates are NOT running. The first version listed only `list` and
 * `send`, and the coordinator correctly concluded it had nobody to delegate to and did the
 * work itself.
 */
function buildTeammateSection(args: { self: Bot; roster: readonly Bot[] }): (string | null)[] {
  // Same project only: delegation never crosses projects, and a teammate in another checkout
  // could not be started here anyway.
  const teammates = getProjectTeammates(args.self, args.roster)
  if (teammates.length === 0) {
    return []
  }
  const lines = teammates.map((bot) => {
    const role = bot.title.trim()
    return `- @${botHandle(bot.name)} — ${bot.name}${role ? `: ${role}` : ''} (agent: ${bot.agentId}, terminal title: ${botSessionTitle(bot)})`
  })
  return [
    '',
    'Teammates you can hand work to:',
    ...lines,
    '',
    // Why this is spelled out so pedantically: `--terminal` takes the OPAQUE RUNTIME HANDLE
    // from `terminal list` (a `term_...` string), not the bot handle and not the title. An
    // earlier version wrote `--terminal <handle>` for both, so coordinators passed `bot:builder`
    // or the bare @handle, got `terminal_handle_stale`, and reported "the handle seems to have
    // changed" — then re-listed and did it again, forever.
    'Each teammate runs in a terminal TITLED bot:<handle>, and Orca starts them for you when you',
    'are given work — so they should already be listed. Two different ids are involved, and',
    'mixing them up is the one mistake that makes this fail:',
    '',
    '  - the TITLE is bot:<handle> — that is how you FIND the teammate',
    '  - the HANDLE is the opaque "handle" field of that row (looks like term_1a2b3c) — that is',
    '    the only thing --terminal accepts. It is not the bot name and not the title.',
    '',
    '  orca terminal list --json',
    '      # find the row whose "title" is exactly bot:<handle>, then read its "handle" field',
    '  orca terminal send --terminal <that handle field> --text "<message>" --enter --json',
    '',
    'Re-read the handle from a fresh `terminal list` after any restart: it changes when the',
    'terminal is recreated, and a stale one fails with terminal_handle_stale.',
    '',
    'If a teammate is somehow missing, start it yourself with that exact title:',
    '',
    '  orca terminal create --worktree active --title "bot:<handle>" --command "<agent>" \\',
    "    --background --json      # --background so the user's current tab is left alone",
    '      # then list again and use the new row\'s "handle" field for --terminal',
    '',
    'The title matters: Orca adopts a terminal with that exact title as that bot’s',
    'conversation, so the user sees your delegation in the right place.',
    'Prefix what you send with who you are. Do not forward a message verbatim — say what you',
    'need in your own words, and only when the work is actually theirs.',
    'If you cannot reach a teammate, SAY SO with the error you got instead of retrying silently',
    'or quietly doing their work yourself.'
  ]
}

/** Terminal title for a bot's conversation, and the discovery key teammates search for. */
export function botSessionTitle(bot: Pick<Bot, 'name'>): string {
  return `bot:${botHandle(bot.name)}`
}

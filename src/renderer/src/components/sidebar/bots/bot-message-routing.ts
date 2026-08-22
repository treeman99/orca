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
 * The teammate roster handed to a bot session when it starts.
 *
 * Named terminals are the discovery mechanism: every bot session launches with the title
 * `bot:<handle>`, so `orca terminal list --json` is enough for one bot to find another. That
 * keeps bot-to-bot messaging on commands that already exist instead of a new RPC that would
 * need capability negotiation to reach a paired client.
 *
 * Returns null when the bot has no teammates — an empty roster is noise in a system prompt.
 */
export function buildBotTeammatePreamble(args: {
  self: Bot
  roster: readonly Bot[]
}): string | null {
  const teammates = args.roster.filter((bot) => bot.id !== args.self.id)
  if (teammates.length === 0) {
    return null
  }
  const lines = teammates.map((bot) => {
    const role = bot.title.trim()
    return `- @${botHandle(bot.name)} — ${bot.name}${role ? `: ${role}` : ''}`
  })
  return [
    `You are the Orca bot "${args.self.name}" (@${botHandle(args.self.name)}).`,
    args.self.title.trim() ? `Your job: ${args.self.title.trim()}` : null,
    '',
    'Teammates you can hand work to:',
    ...lines,
    '',
    'To message a teammate, find its terminal and send to it:',
    '  orca terminal list --json          # the teammate runs under the title bot:<handle>',
    '  orca terminal send --terminal <handle> --text "<message>" --enter --json',
    'Prefix what you send with who you are. Do not forward a message verbatim —',
    'say what you need in your own words, and only when the work is actually theirs.'
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/** Terminal title for a bot's conversation, and the discovery key teammates search for. */
export function botSessionTitle(bot: Pick<Bot, 'name'>): string {
  return `bot:${botHandle(bot.name)}`
}

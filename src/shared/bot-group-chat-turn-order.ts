// Who speaks this round, in what order, and what counts as staying silent.
//
// Every rule here is deterministic — no model decides who talks. That is what keeps a room
// bounded: a router that "picks the best responder" has no natural stopping point, while a
// mention parse plus a round cap does.
//
// Deliberately NOT reusing `parseBotMention` from bot-message-routing.ts: that one matches a
// LEADING mention only, because in a 1:1 composer a mid-sentence @name is prose meant for the
// bot you are looking at. In a room every @name is an address.

import { botHandle, type Bot } from './bot-types'
import { groupThreadOf, type BotGroupChatEntry } from './bot-group-chat-types'

/** `(pass)` — loosely `pass`, `(pass)`, `pass.` — or nothing at all is silence.
 *  An empty reply counting as a pass is load-bearing: agents whose hooks report a finished
 *  turn without any assistant text would otherwise stall the room forever. */
export function isGroupPassText(text: string | null | undefined): boolean {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) {
    return true
  }
  return /^\(?\s*pass\s*\)?\.?$/i.test(trimmed)
}

/** Address forms one bot answers to: handle, name, title, and their space-collapsed forms. */
function mentionFormsFor(bot: Bot): string[] {
  const handle = botHandle(bot.name)
  const title = bot.title.trim()
  const forms = [
    handle,
    handle.replace(/[\s_-]+/g, ''),
    bot.name.trim().toLowerCase(),
    bot.name
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ''),
    ...(title
      ? [
          title.toLowerCase(),
          title.toLowerCase().replace(/[\s_-]+/g, ''),
          title.split(/\s+/)[0].toLowerCase()
        ]
      : [])
  ]
  return forms.filter((form) => form !== '')
}

export type GroupChatMentions = {
  /** `@everyone` / `@all` appeared. */
  everyone: boolean
  /** Bot ids addressed by name. */
  mentioned: Set<string>
  /** `@user` appeared — the room wants a human, not another bot turn. */
  needsUser: boolean
}

const MENTION_TOKEN = /@([a-z0-9][a-z0-9._-]*)/gi

/**
 * Every `@name` in the text, resolved against the roster.
 *
 * Unresolvable handles are ignored rather than reported: in a room the text is prose that
 * happens to contain an at-sign as often as it is an address, and refusing to deliver a
 * message because one token did not resolve would lose the message.
 */
export function parseGroupChatMentions(text: string, members: readonly Bot[]): GroupChatMentions {
  const byForm = new Map<string, string>()
  for (const bot of members) {
    for (const form of mentionFormsFor(bot)) {
      byForm.set(form, bot.id)
    }
  }

  const mentioned = new Set<string>()
  let everyone = false
  let needsUser = false

  for (const match of String(text ?? '').matchAll(MENTION_TOKEN)) {
    const handle = match[1].toLowerCase()
    if (handle === 'everyone' || handle === 'all') {
      everyone = true
      continue
    }
    if (handle === 'user') {
      needsUser = true
      continue
    }
    const resolved = byForm.get(handle) ?? byForm.get(handle.replace(/[._-]+/g, ''))
    if (resolved) {
      mentioned.add(resolved)
    }
  }

  return { everyone, mentioned, needsUser }
}

/**
 * Members that should take a turn, recomputed every round.
 *
 * The scan window is everything since the last user entry — including bot entries, so a bot
 * that names a teammate pulls them into the next round. No mentions at all (or `@everyone`)
 * means the whole room answers.
 */
export function resolveGroupResponders(
  log: readonly BotGroupChatEntry[],
  members: readonly Bot[]
): Bot[] {
  let sinceLastUser: readonly BotGroupChatEntry[] = []
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].from.kind === 'user') {
      sinceLastUser = log.slice(i)
      break
    }
  }

  const mentioned = new Set<string>()
  let everyone = false
  for (const entry of sinceLastUser) {
    const parsed = parseGroupChatMentions(entry.text, members)
    if (parsed.everyone) {
      everyone = true
    }
    for (const id of parsed.mentioned) {
      mentioned.add(id)
    }
  }

  if (everyone || mentioned.size === 0) {
    return [...members]
  }
  return members.filter((bot) => mentioned.has(bot.id))
}

/**
 * Rotate the roster so a different member leads each round.
 *
 * Without this the same member always frames the topic and the rest read as "already said",
 * so they pass — the room collapses to one voice. The rotation is deterministic, not random.
 */
export function rotateGroupSpeakers(members: readonly Bot[], round: number): Bot[] {
  if (members.length < 2) {
    return [...members]
  }
  const shift = round % members.length
  return [...members.slice(shift), ...members.slice(0, shift)]
}

/** Entries a member has not been shown yet, narrowed to the thread being driven. */
export function selectTurnDelta(
  log: readonly BotGroupChatEntry[],
  seen: number,
  thread: string
): BotGroupChatEntry[] {
  return log.slice(Math.max(0, seen)).filter((entry) => groupThreadOf(entry) === thread)
}

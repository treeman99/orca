// The @-completion contract for the room composers, kept out of the component so the one
// regex that decides "is the caret inside a mention" is testable on its own.
//
// The '@' must begin a word. In a room `a@b` is an email fragment, not an address, and a
// member list popping open over every typed address would be noise rather than help.

import { botHandle, type Bot } from '../../../../../../shared/bot-types'

/** Room-wide addresses `parseGroupChatMentions` resolves before any roster lookup. */
export const GROUP_MENTION_EVERYONE_HANDLES = ['everyone', 'all'] as const

export type GroupMentionToken = {
  /** Lowercased text between the '@' and the caret. */
  query: string
  /** Index of the '@' in the source text. */
  start: number
}

const MENTION_AT_CARET = /(^|\s)@([a-z0-9._-]*)$/i

/** The mention being typed at `caret`, or null when the caret is not inside one. */
export function mentionTokenAt(text: string, caret: number): GroupMentionToken | null {
  const upto = String(text ?? '').slice(0, Math.max(0, caret))
  const match = MENTION_AT_CARET.exec(upto)
  if (!match) {
    return null
  }
  return { query: match[2].toLowerCase(), start: upto.length - match[2].length - 1 }
}

export type GroupMentionOption =
  | { kind: 'everyone'; handle: string }
  | { kind: 'member'; handle: string; botId: string; name: string; title: string }

/** Handle, display name, and title all complete — a member is addressable by any of them. */
function matchesQuery(query: string, forms: readonly string[]): boolean {
  if (query === '') {
    return true
  }
  return forms.some((form) => form.trim() !== '' && form.trim().toLowerCase().startsWith(query))
}

/**
 * Completions for the token at the caret: the room-wide addresses first, then members.
 *
 * `@everyone` leads because it is the one address that always resolves — a roster filtered
 * to nothing still leaves the user a way to reach the room.
 */
export function buildMentionOptions(
  token: GroupMentionToken | null,
  members: readonly Bot[]
): GroupMentionOption[] {
  if (!token) {
    return []
  }
  const options: GroupMentionOption[] = []
  for (const handle of GROUP_MENTION_EVERYONE_HANDLES) {
    if (handle.startsWith(token.query)) {
      options.push({ kind: 'everyone', handle })
    }
  }
  for (const member of members) {
    const handle = botHandle(member.name)
    if (!matchesQuery(token.query, [handle, member.name, member.title])) {
      continue
    }
    options.push({
      kind: 'member',
      handle,
      botId: member.id,
      name: member.name,
      title: member.title.trim()
    })
  }
  return options
}

/**
 * Replace the token with exactly `@handle ` and report where the caret belongs.
 *
 * The trailing space is load-bearing: `parseGroupChatMentions` reads `[a-z0-9._-]` greedily,
 * so an inserted handle butted against the next word would resolve to neither.
 */
export function insertMention(args: {
  value: string
  caret: number
  token: GroupMentionToken
  handle: string
}): { text: string; caret: number } {
  const { value, token, handle } = args
  const caret = Math.min(Math.max(0, args.caret), value.length)
  return {
    text: `${value.slice(0, token.start)}@${handle} ${value.slice(caret)}`,
    caret: token.start + handle.length + 2
  }
}

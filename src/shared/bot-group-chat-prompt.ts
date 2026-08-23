// What one member actually reads on its turn.
//
// Two halves that arrive at different times. The ROLE half (who you are, the standing
// instructions your creator wrote) goes in once, when the room session is launched — a fresh
// agent that was never told it is a bot runs the room prompt as a generic assistant. The
// ROOM half travels on every turn, because the rules are what keep the conversation bounded
// and a compacted session must not quietly lose them.
//
// Hermes ships only the room half: there a member's identity lives in the gateway profile the
// session is attached to, so nothing has to re-state it. Orca launches an ordinary agent CLI
// with no such profile, so the role block is ours to carry.

import { botHandle, type Bot } from './bot-types'
import { GROUP_CHAT_HISTORY_LIMIT, type BotGroupChatEntry } from './bot-group-chat-types'

/** One room-log line as a given member sees it. */
export function formatGroupChatLine(entry: BotGroupChatEntry, viewerBotId: string): string {
  if (entry.from.kind === 'user') {
    return `You (user): ${entry.text}`
  }
  const suffix = entry.from.botId === viewerBotId ? ' (you)' : ''
  return `${entry.from.name}${suffix}: ${entry.text}`
}

function peerLabel(bot: Bot): string {
  const handle = `@${botHandle(bot.name)}`
  const title = bot.title.trim()
  return title ? `${title} (${handle})` : handle
}

/**
 * The per-turn payload: who is here, what is new, and the four rules that bound the room.
 *
 * The rules are worth reading as a set — each one prevents a specific failure seen in Hermes:
 * unbounded chatter, a room that never settles, members answering the wrong party, and a bot
 * quoting its private 1:1 conversation into a shared room.
 */
export function buildGroupChatTurnPrompt(args: {
  roomName: string
  members: readonly Bot[]
  viewer: Bot
  delta: readonly BotGroupChatEntry[]
}): string {
  const { roomName, members, viewer, delta } = args
  const peers = members.filter((bot) => bot.id !== viewer.id)
  const peerNames = peers.length > 0 ? peers.map(peerLabel).join(', ') : 'no one else yet'
  const lines = delta
    .slice(-GROUP_CHAT_HISTORY_LIMIT)
    .map((entry) => `  ${formatGroupChatLine(entry, viewer.id)}`)

  return [
    `[Group chat: "${roomName}"] You are @${botHandle(viewer.name)}, one participant in a group chat with ${peerNames} and the user.`,
    '',
    'New messages in the room since your last turn (oldest first):',
    ...lines,
    '',
    'Rules for this room:',
    '- Reply with ONE conversational message ONLY if you have something new worth adding: build',
    '  on what was just said, claim or hand off work, answer a question aimed at you, or report',
    '  a real result. Keep chatter short (1-3 sentences) — but when you are delivering a result,',
    '  an answer the user asked for, or substantive work, give it at full quality and length;',
    '  never thin out real content to fit the room.',
    '- If you have nothing new to add, reply with exactly "(pass)". Passing is good — it lets the',
    '  conversation settle.',
    '- Mention a teammate as @name to pull them in; mention @user only for a judgment call or a',
    '  result the user needs. Do not repeat points already made.',
    '- Never reveal content from your private 1:1 chats. Your reply text goes to the room',
    '  verbatim — no preamble, no meta-commentary.'
  ].join('\n')
}

/**
 * First prompt of a member's room session: identity, then the room itself.
 *
 * `roleBlock` comes from the 1:1 lane (`buildBotRoleBlock`) so a bot's standing instructions
 * mean the same thing in both places — a description that says "only look in this repo" must
 * not stop applying because the work arrived through a room.
 */
export function buildGroupChatSessionPrompt(args: {
  roleBlock: string
  turnPrompt: string
}): string {
  return [
    args.roleBlock,
    '',
    'You have been added to a group chat. Everything below describes that room, and its rules',
    'apply to every turn you take there.',
    '',
    '---',
    '',
    args.turnPrompt
  ].join('\n')
}

/** The prompt a member gets when the room starts it with nothing to say yet. */
export function buildGroupChatStandbyPrompt(args: { roleBlock: string; roomName: string }): string {
  return [
    args.roleBlock,
    '',
    `You have been added to the group chat "${args.roomName}". Wait — when someone speaks there,`,
    'you will be given the new messages and the rules for replying. Do nothing until then.'
  ].join('\n')
}

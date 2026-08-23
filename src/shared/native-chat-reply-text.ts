// Pulling one turn's assistant prose out of a parsed transcript.
//
// Why this exists next to `AgentStatusEntry.lastAssistantMessage`: that field is capped at
// AGENT_STATUS_ASSISTANT_MESSAGE_MAX_LENGTH (8000), and a group room's turn prompt explicitly
// asks members to answer at full length when they are delivering a result. Reading the
// transcript gives the untruncated text; the status field stays the fallback for agents whose
// transcripts Orca cannot parse.

import type { NativeChatMessage } from './native-chat-types'

/** Visible prose of one message — tool calls and results are not room speech. */
export function nativeChatMessageText(message: NativeChatMessage): string {
  return message.blocks
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim()
}

/**
 * The newest assistant message produced after `after`, or null.
 *
 * Scans from the end because a turn's answer is its last assistant message; earlier ones in
 * the same turn are intermediate narration the room does not want. A message with no
 * timestamp is skipped rather than assumed recent — claiming an undated message as this
 * turn's reply would post a stale answer into the room.
 */
export function findAssistantReplyAfter(
  messages: readonly NativeChatMessage[],
  after: number
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'assistant') {
      continue
    }
    if (typeof message.timestamp !== 'number') {
      continue
    }
    if (message.timestamp < after) {
      // Messages are ordered, so everything earlier is older still.
      return null
    }
    const text = nativeChatMessageText(message)
    if (text) {
      return text
    }
  }
  return null
}

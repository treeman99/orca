// opencode message + its parts → NativeChatMessage[].
//
// opencode does not write a transcript LINE, so this decoder takes objects rather than a string
// like its siblings: one `storage/message/<sessionID>/<msgID>.json` envelope (role, model, no
// text at all) plus every `storage/part/<msgID>/<partID>.json` under it, which is where the
// text, reasoning and tool calls actually live.
//
// One part becomes one message, following Codex: a tool call and its result are separate
// bubbles with their own roles, so the renderer can fold them independently. Part ids are
// lexicographically chronological (verified against `time.created` across real sessions), which
// is what orders parts that carry no timestamp of their own — `step-start` has neither.

import type { NativeChatMessage } from '../../shared/native-chat-types'
import { asRecord, extractString, timestampMs } from '../ai-vault/session-scanner-values'

/** The envelope fields this decoder reads; the rest (tokens, cost, path) is not conversation. */
export type OpenCodeMessageRecord = {
  id: string
  role: string
  time?: { created?: number }
}

export type OpenCodePartRecord = Record<string, unknown>

function partTimestamp(part: OpenCodePartRecord, fallback: number | null): number | null {
  const time = asRecord(part.time) ?? asRecord(asRecord(part.state)?.time)
  const started = timestampMs(time?.start)
  return Number.isFinite(started) ? started : fallback
}

function decodeToolPart(
  part: OpenCodePartRecord,
  partId: string,
  timestamp: number | null
): NativeChatMessage[] {
  const state = asRecord(part.state)
  const name = extractString(part.tool) ?? 'tool'
  const messages: NativeChatMessage[] = [
    {
      id: `${partId}:call`,
      role: 'assistant',
      blocks: [{ type: 'tool-call', name, input: state?.input }],
      timestamp,
      source: 'transcript'
    }
  ]
  const status = extractString(state?.status)
  // A running tool has no output yet; emitting an empty result would render a blank bubble that
  // never fills in, because the next read replaces this message wholesale rather than appending.
  const output = extractString(state?.output) ?? extractString(state?.error)
  if (output) {
    messages.push({
      id: `${partId}:result`,
      role: 'tool',
      blocks: [{ type: 'tool-result', output, ...(status === 'error' ? { isError: true } : {}) }],
      timestamp,
      source: 'transcript'
    })
  }
  return messages
}

/**
 * Decode one opencode message and its parts, in part order.
 *
 * `parts` must already be sorted by id. Returns [] for a message whose parts carry nothing to
 * show — an assistant turn that only opened a step, or a reasoning part whose text the provider
 * withheld (OpenAI returns encrypted reasoning with `text: ""`).
 */
export function decodeOpenCodeMessage(
  message: OpenCodeMessageRecord,
  parts: readonly OpenCodePartRecord[]
): NativeChatMessage[] {
  const role = message.role === 'user' ? 'user' : 'assistant'
  const created = timestampMs(message.time?.created)
  const messageTimestamp = Number.isFinite(created) ? created : null
  const decoded: NativeChatMessage[] = []
  for (const part of parts) {
    const partId = extractString(part.id)
    if (!partId) {
      continue
    }
    const timestamp = partTimestamp(part, messageTimestamp)
    const type = extractString(part.type)
    if (type === 'text') {
      const text = extractString(part.text)?.trim()
      if (text) {
        decoded.push({
          id: partId,
          role,
          blocks: [{ type: 'text', text }],
          timestamp,
          source: 'transcript'
        })
      }
      continue
    }
    if (type === 'reasoning') {
      const text = extractString(part.text)?.trim()
      if (text) {
        decoded.push({
          id: partId,
          role: 'reasoning',
          blocks: [{ type: 'text', text }],
          timestamp,
          source: 'transcript'
        })
      }
      continue
    }
    if (type === 'tool') {
      decoded.push(...decodeToolPart(part, partId, timestamp))
    }
    // `step-start`, `step-finish` and `patch` are turn bookkeeping, not conversation.
  }
  return decoded
}

/** Sort key for opencode ids. Ids are time-ordered, so lexicographic IS chronological. */
export function compareOpenCodeIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

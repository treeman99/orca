// Appending to a room log, and keeping it bounded without corrupting who has read what.
//
// The whole file exists for one invariant: watermarks are INDICES into `log`. Trimming the
// log without shifting every watermark by the same amount silently rewinds each member to
// messages it already answered — which reads as bots repeating themselves, not as a bug in
// retention.

import {
  GROUP_CHAT_LOG_LIMIT,
  GROUP_THREAD_GAP_MS,
  groupChatWatermarkKey,
  groupThreadOf,
  type BotGroupChatEntry,
  type BotGroupChatSpeaker
} from './bot-group-chat-types'

export type BoundedLog = {
  log: BotGroupChatEntry[]
  watermarks: Record<string, number>
}

/** Drop the oldest entries past the retention window, shifting watermarks with them. */
export function trimGroupChatLog(
  log: readonly BotGroupChatEntry[],
  watermarks: Readonly<Record<string, number>>,
  limit: number = GROUP_CHAT_LOG_LIMIT
): BoundedLog {
  if (log.length <= limit) {
    return { log: [...log], watermarks: { ...watermarks } }
  }
  const drop = log.length - limit
  const shifted: Record<string, number> = {}
  for (const [key, index] of Object.entries(watermarks)) {
    shifted[key] = Math.max(0, index - drop)
  }
  return { log: log.slice(drop), watermarks: shifted }
}

export function mintGroupThreadId(now: number, random: string): string {
  return `t${now.toString(36)}-${random}`
}

export function makeGroupChatEntry(args: {
  id: string
  at: number
  from: BotGroupChatSpeaker
  text: string
  thread: string
  truncated?: boolean
}): BotGroupChatEntry {
  return {
    id: args.id,
    at: args.at,
    from: args.from,
    text: args.text.trim(),
    thread: args.thread,
    ...(args.truncated ? { truncated: true } : {})
  }
}

/** Append and re-bound in one step, so no caller can persist an untrimmed log. */
export function appendGroupChatEntry(
  current: BoundedLog,
  entry: BotGroupChatEntry,
  limit: number = GROUP_CHAT_LOG_LIMIT
): BoundedLog {
  return trimGroupChatLog([...current.log, entry], current.watermarks, limit)
}

/** Mark a member as having seen the whole log up to now, for one thread. */
export function advanceWatermark(
  watermarks: Readonly<Record<string, number>>,
  thread: string,
  botId: string,
  logLength: number
): Record<string, number> {
  return { ...watermarks, [groupChatWatermarkKey(thread, botId)]: logLength }
}

export function readWatermark(
  watermarks: Readonly<Record<string, number>>,
  thread: string,
  botId: string
): number {
  return watermarks[groupChatWatermarkKey(thread, botId)] ?? 0
}

/**
 * Give thread-less entries synthetic threads when loading an older log.
 *
 * A user entry after a real lull opens one, so a multi-turn task stays whole instead of
 * splitting on every follow-up. Entries that already carry a thread are left alone.
 */
export function assignLegacyThreads(
  log: readonly BotGroupChatEntry[],
  gapMs: number = GROUP_THREAD_GAP_MS
): BotGroupChatEntry[] {
  let current: string | null = null
  let counter = 0
  return log.map((entry, index) => {
    if (entry.thread) {
      current = null
      return entry
    }
    const previous = log[index - 1]
    const lull = !previous || (entry.at || 0) - (previous.at || 0) > gapMs
    if (!current || (entry.from.kind === 'user' && lull)) {
      current = `legacy-${counter++}`
    }
    return { ...entry, thread: current }
  })
}

export type GroupThreadSummary = {
  thread: string
  /** First user entry of the thread, which titles it in the UI. */
  head: BotGroupChatEntry
  entries: BotGroupChatEntry[]
  lastActivityAt: number
  replyCount: number
}

/** Threads oldest-activity-first, so the newest sits closest to the composer. */
export function summarizeGroupThreads(log: readonly BotGroupChatEntry[]): GroupThreadSummary[] {
  const byThread = new Map<string, BotGroupChatEntry[]>()
  for (const entry of log) {
    const thread = groupThreadOf(entry)
    const bucket = byThread.get(thread)
    if (bucket) {
      bucket.push(entry)
    } else {
      byThread.set(thread, [entry])
    }
  }
  return [...byThread.entries()]
    .map(([thread, entries]) => ({
      thread,
      head: entries[0],
      entries,
      lastActivityAt: entries.at(-1)?.at ?? 0,
      replyCount: Math.max(0, entries.length - 1)
    }))
    .sort((left, right) => left.lastActivityAt - right.lastActivityAt)
}

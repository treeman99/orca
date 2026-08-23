// What the room log looks like once it is folded into threads, and how each fold decides
// whether it renders open.
//
// The rule is "newest open, older folded, user override wins". It lives here rather than in
// the list component because the default is not a render detail: a room that opens with the
// live thread collapsed reads as an empty room, and that regression is invisible in a
// component test that only checks the rows it was handed.

import { translate } from '@/i18n/i18n'
import { summarizeGroupThreads } from '../../../../../../shared/bot-group-chat-log'
import type { BotGroupChatEntry } from '../../../../../../shared/bot-group-chat-types'

export const THREAD_PREVIEW_MAX_LENGTH = 80

/** Enough markdown flattening for a one-line fold summary. Not a renderer. */
export function stripPreviewMarkdown(text: string): string {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type GroupThreadView = {
  thread: string
  entries: readonly BotGroupChatEntry[]
  /** Fold summary: the thread's opening user message, flattened and clipped. */
  headText: string
  replyCount: number
  lastActivityAt: number
  expanded: boolean
  isNewest: boolean
  /** The newest thread hides its collapse row until the user has touched the fold —
   *  otherwise every room opens with a control nobody asked for above the live thread. */
  showCollapseRow: boolean
}

/**
 * Threads oldest-activity-first, so the live one sits closest to the composer.
 *
 * The head is the thread's first USER entry, not its first entry: a thread whose opener
 * scrolled out of retention would otherwise be titled by whichever bot spoke next.
 */
export function buildGroupThreadViews(
  log: readonly BotGroupChatEntry[],
  openThreads: Readonly<Record<string, boolean>>
): GroupThreadView[] {
  const summaries = summarizeGroupThreads(log)
  const newest = summaries.at(-1)?.thread ?? null
  return summaries.map((summary) => {
    const isNewest = summary.thread === newest
    const override = openThreads[summary.thread]
    const head = summary.entries.find((entry) => entry.from.kind === 'user') ?? summary.head
    return {
      thread: summary.thread,
      entries: summary.entries,
      headText: stripPreviewMarkdown(head?.text ?? '').slice(0, THREAD_PREVIEW_MAX_LENGTH),
      replyCount: summary.replyCount,
      lastActivityAt: summary.lastActivityAt,
      expanded: override ?? isNewest,
      isNewest,
      showCollapseRow: !isNewest || override !== undefined
    }
  })
}

export type GroupRelativeTime =
  | { unit: 'now'; value: 0 }
  | { unit: 'seconds' | 'minutes' | 'hours' | 'days'; value: number }

/** Coarse buckets only. A room log is read as a conversation, not as an audit trail. */
export function groupRelativeTimeParts(at: number, now: number): GroupRelativeTime {
  const seconds = Math.floor(Math.max(0, now - (at || 0)) / 1000)
  if (seconds < 5) {
    return { unit: 'now', value: 0 }
  }
  if (seconds < 60) {
    return { unit: 'seconds', value: seconds }
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return { unit: 'minutes', value: minutes }
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return { unit: 'hours', value: hours }
  }
  return { unit: 'days', value: Math.floor(hours / 24) }
}

export function formatGroupRelativeTime(at: number, now: number): string {
  const parts = groupRelativeTimeParts(at, now)
  switch (parts.unit) {
    case 'now':
      return translate('auto.components.sidebar.bots.group.group-thread-view-state.a1c07f3e', 'now')
    case 'seconds':
      return translate(
        'auto.components.sidebar.bots.group.group-thread-view-state.b42d9e17',
        '{{value0}}s ago',
        { value0: parts.value }
      )
    case 'minutes':
      return translate(
        'auto.components.sidebar.bots.group.group-thread-view-state.c58e0a26',
        '{{value0}}m ago',
        { value0: parts.value }
      )
    case 'hours':
      return translate(
        'auto.components.sidebar.bots.group.group-thread-view-state.d61b4c85',
        '{{value0}}h ago',
        { value0: parts.value }
      )
    case 'days':
      return translate(
        'auto.components.sidebar.bots.group.group-thread-view-state.e7f2183b',
        '{{value0}}d ago',
        { value0: parts.value }
      )
  }
}

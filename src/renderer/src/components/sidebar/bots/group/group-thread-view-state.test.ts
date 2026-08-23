import { describe, expect, it } from 'vitest'
import type { BotGroupChatEntry } from '../../../../../../shared/bot-group-chat-types'
import {
  buildGroupThreadViews,
  formatGroupRelativeTime,
  groupRelativeTimeParts,
  stripPreviewMarkdown
} from './group-thread-view-state'

function userEntry(id: string, thread: string, at: number, text = `msg ${id}`): BotGroupChatEntry {
  return { id, at, from: { kind: 'user' }, text, thread }
}

function botEntry(id: string, thread: string, at: number, text = `msg ${id}`): BotGroupChatEntry {
  return { id, at, from: { kind: 'member', botId: 'b1', name: 'Ada' }, text, thread }
}

describe('stripPreviewMarkdown', () => {
  it('flattens fences, inline code, links, and emphasis to one line', () => {
    expect(stripPreviewMarkdown('# Ship it\n\n`npm ci` then [docs](http://x) **now**')).toBe(
      'Ship it npm ci then docs now'
    )
  })

  it('drops fenced blocks entirely', () => {
    expect(stripPreviewMarkdown('before\n```\ncode()\n```\nafter')).toBe('before after')
  })
})

describe('buildGroupThreadViews', () => {
  it('orders threads oldest-activity-first so the live one sits by the composer', () => {
    const views = buildGroupThreadViews(
      [userEntry('a', 't1', 100), userEntry('b', 't2', 300), botEntry('c', 't1', 200)],
      {}
    )
    expect(views.map((view) => view.thread)).toEqual(['t1', 't2'])
  })

  it('expands only the newest thread by default', () => {
    const views = buildGroupThreadViews([userEntry('a', 't1', 100), userEntry('b', 't2', 200)], {})
    expect(views.map((view) => [view.thread, view.expanded])).toEqual([
      ['t1', false],
      ['t2', true]
    ])
  })

  it('lets an explicit override collapse the newest thread', () => {
    const views = buildGroupThreadViews([userEntry('a', 't1', 100)], { t1: false })
    expect(views[0]).toMatchObject({ expanded: false, isNewest: true, showCollapseRow: true })
  })

  it('hides the collapse row on an untouched newest thread', () => {
    expect(buildGroupThreadViews([userEntry('a', 't1', 100)], {})[0].showCollapseRow).toBe(false)
  })

  it('titles a thread by its first user entry, not its first entry', () => {
    const views = buildGroupThreadViews(
      [botEntry('a', 't1', 100, 'late reply'), userEntry('b', 't1', 200, 'the ask')],
      {}
    )
    expect(views[0].headText).toBe('the ask')
  })

  it('clips a long head to the fold width', () => {
    const views = buildGroupThreadViews([userEntry('a', 't1', 100, 'x'.repeat(200))], {})
    expect(views[0].headText).toHaveLength(80)
  })

  it('counts replies as everything after the thread opener', () => {
    const views = buildGroupThreadViews(
      [userEntry('a', 't1', 100), botEntry('b', 't1', 200), botEntry('c', 't1', 300)],
      {}
    )
    expect(views[0].replyCount).toBe(2)
    expect(views[0].lastActivityAt).toBe(300)
  })

  it('buckets thread-less entries under the legacy thread', () => {
    const views = buildGroupThreadViews([{ ...userEntry('a', '', 100) }], {})
    expect(views[0].thread).toBe('legacy')
  })
})

describe('groupRelativeTimeParts', () => {
  const NOW = 10_000_000

  it('calls anything under five seconds "now"', () => {
    expect(groupRelativeTimeParts(NOW - 3_000, NOW)).toEqual({ unit: 'now', value: 0 })
  })

  it('steps through seconds, minutes, hours, and days', () => {
    expect(groupRelativeTimeParts(NOW - 30_000, NOW)).toEqual({ unit: 'seconds', value: 30 })
    expect(groupRelativeTimeParts(NOW - 5 * 60_000, NOW)).toEqual({ unit: 'minutes', value: 5 })
    expect(groupRelativeTimeParts(NOW - 3 * 3_600_000, NOW)).toEqual({ unit: 'hours', value: 3 })
    expect(groupRelativeTimeParts(NOW - 2 * 86_400_000, NOW)).toEqual({ unit: 'days', value: 2 })
  })

  it('never reports a negative age for a clock that ran backwards', () => {
    expect(groupRelativeTimeParts(NOW + 60_000, NOW)).toEqual({ unit: 'now', value: 0 })
  })
})

describe('formatGroupRelativeTime', () => {
  it('renders each bucket', () => {
    const now = 10_000_000
    expect(formatGroupRelativeTime(now, now)).toBe('now')
    expect(formatGroupRelativeTime(now - 30_000, now)).toBe('30s ago')
    expect(formatGroupRelativeTime(now - 5 * 60_000, now)).toBe('5m ago')
    expect(formatGroupRelativeTime(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(formatGroupRelativeTime(now - 2 * 86_400_000, now)).toBe('2d ago')
  })
})

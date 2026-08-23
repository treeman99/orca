import { describe, expect, it } from 'vitest'
import {
  advanceWatermark,
  appendGroupChatEntry,
  assignLegacyThreads,
  makeGroupChatEntry,
  readWatermark,
  summarizeGroupThreads,
  trimGroupChatLog
} from './bot-group-chat-log'
import { GROUP_THREAD_GAP_MS, type BotGroupChatEntry } from './bot-group-chat-types'

function entry(id: string, at: number, thread = 't1', kind: 'user' | 'member' = 'user') {
  return makeGroupChatEntry({
    id,
    at,
    from: kind === 'user' ? { kind: 'user' } : { kind: 'member', botId: 'b1', name: 'Radar' },
    text: id,
    thread
  })
}

describe('trimGroupChatLog', () => {
  it('leaves a short log untouched', () => {
    const log = [entry('a', 1), entry('b', 2)]
    const result = trimGroupChatLog(log, { 't1::b1': 1 }, 10)
    expect(result.log).toHaveLength(2)
    expect(result.watermarks['t1::b1']).toBe(1)
  })

  it('shifts watermarks by exactly what it dropped', () => {
    // The invariant this whole module exists for: watermarks are indices into `log`, so a
    // trim that does not move them rewinds every member to messages it already answered.
    const log = [entry('a', 1), entry('b', 2), entry('c', 3), entry('d', 4)]
    const result = trimGroupChatLog(log, { 't1::b1': 3, 't1::b2': 1 }, 2)
    expect(result.log.map((e) => e.id)).toEqual(['c', 'd'])
    expect(result.watermarks['t1::b1']).toBe(1)
    expect(result.watermarks['t1::b2']).toBe(0)
  })

  it('never produces a negative watermark', () => {
    const log = [entry('a', 1), entry('b', 2), entry('c', 3)]
    const result = trimGroupChatLog(log, { 't1::b1': 0 }, 1)
    expect(result.watermarks['t1::b1']).toBe(0)
  })
})

describe('appendGroupChatEntry', () => {
  it('re-bounds on append so an untrimmed log can never be persisted', () => {
    const current = { log: [entry('a', 1), entry('b', 2)], watermarks: { 't1::b1': 2 } }
    const result = appendGroupChatEntry(current, entry('c', 3), 2)
    expect(result.log.map((e) => e.id)).toEqual(['b', 'c'])
    expect(result.watermarks['t1::b1']).toBe(1)
  })
})

describe('watermarks', () => {
  it('round-trips per thread and bot', () => {
    const marks = advanceWatermark({}, 't1', 'b1', 5)
    expect(readWatermark(marks, 't1', 'b1')).toBe(5)
    // A different thread is a different reading position for the same bot.
    expect(readWatermark(marks, 't2', 'b1')).toBe(0)
  })
})

describe('assignLegacyThreads', () => {
  it('leaves entries that already carry a thread', () => {
    const log = [entry('a', 1, 't9')]
    expect(assignLegacyThreads(log)[0].thread).toBe('t9')
  })

  it('opens a new thread on a user entry after a lull', () => {
    const log: BotGroupChatEntry[] = [
      { ...entry('a', 0), thread: '' },
      { ...entry('b', 1000, 't1', 'member'), thread: '' },
      { ...entry('c', 1000 + GROUP_THREAD_GAP_MS + 1), thread: '' }
    ]
    const assigned = assignLegacyThreads(log)
    expect(assigned[0].thread).toBe(assigned[1].thread)
    expect(assigned[2].thread).not.toBe(assigned[0].thread)
  })

  it('keeps a multi-turn exchange whole when replies come quickly', () => {
    const log: BotGroupChatEntry[] = [
      { ...entry('a', 0), thread: '' },
      { ...entry('b', 500), thread: '' }
    ]
    const assigned = assignLegacyThreads(log)
    expect(assigned[0].thread).toBe(assigned[1].thread)
  })
})

describe('summarizeGroupThreads', () => {
  it('orders threads by last activity, oldest first', () => {
    const log = [entry('a', 1, 't1'), entry('b', 5, 't2'), entry('c', 9, 't1')]
    const summaries = summarizeGroupThreads(log)
    expect(summaries.map((s) => s.thread)).toEqual(['t2', 't1'])
  })

  it('counts replies as everything after the head', () => {
    const log = [entry('a', 1, 't1'), entry('b', 2, 't1'), entry('c', 3, 't1')]
    const [summary] = summarizeGroupThreads(log)
    expect(summary.head.id).toBe('a')
    expect(summary.replyCount).toBe(2)
  })
})

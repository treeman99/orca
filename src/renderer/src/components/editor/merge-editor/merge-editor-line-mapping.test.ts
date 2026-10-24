import { describe, expect, it } from 'vitest'
import { mapLineThroughRanges } from './merge-editor-line-mapping'

// Source lines 3-4 became target lines 3-6; source 10-11 was deleted at target line 12.
const from = [
  { start: 3, endExclusive: 5 },
  { start: 10, endExclusive: 12 }
]
const to = [
  { start: 3, endExclusive: 7 },
  { start: 12, endExclusive: 12 }
]

describe('mapLineThroughRanges (scroll sync)', () => {
  it.each([
    ['before every range', 2, 2],
    ['inside a range, keeping its offset', 4, 4],
    ['between ranges, shifted by the growth above', 8, 10],
    ['inside a range that vanished, at its insertion point', 11, 12],
    ['after every range', 15, 15]
  ])('maps a line %s', (_name, line, expected) => {
    expect(mapLineThroughRanges(line, from, to)).toBe(expected)
  })
})

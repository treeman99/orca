import { describe, expect, it } from 'vitest'
import {
  applyRangeState,
  computeAutoMergedResult,
  computeRangeStates,
  computeResultLayout,
  createMergeDocument,
  detectEol,
  getResultLineRange,
  withInputValue,
  type MergeDocument,
  type MergeRangeState
} from './merge-editor-model'

const lf = (...lines: string[]): string => lines.map((line) => `${line}\n`).join('')

// b: input1 only, d: input2 only, f: identical on both sides, h: a true conflict.
const fourKinds = createMergeDocument({
  base: lf('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'),
  input1: lf('a', 'B', 'c', 'd', 'e', 'F', 'g', 'H1', 'i'),
  input2: lf('a', 'b', 'c', 'D', 'e', 'F', 'g', 'H2', 'i'),
  eol: '\n'
})

// Adjacent edits on lines b and c fall into one conflicting range that still combines.
const adjacent = createMergeDocument({
  base: lf('a', 'b', 'c', 'd'),
  input1: lf('a', 'B', 'c', 'd'),
  input2: lf('a', 'b', 'C', 'd'),
  eol: '\n'
})

const bothAdded = createMergeDocument({
  base: '',
  input1: lf('x', 'y'),
  input2: lf('z'),
  eol: '\n'
})

describe('createMergeDocument and computeAutoMergedResult', () => {
  it('takes one-sided and identical changes and leaves a true conflict at base', () => {
    expect(
      fourKinds.ranges.map(({ base, isConflicting, isEqualChange }) => ({
        base,
        isConflicting,
        isEqualChange
      }))
    ).toEqual([
      { base: { start: 2, endExclusive: 3 }, isConflicting: false, isEqualChange: false },
      { base: { start: 4, endExclusive: 5 }, isConflicting: false, isEqualChange: false },
      { base: { start: 6, endExclusive: 7 }, isConflicting: true, isEqualChange: true },
      { base: { start: 8, endExclusive: 9 }, isConflicting: true, isEqualChange: false }
    ])
    const result = computeAutoMergedResult(fourKinds)
    expect(result).toBe(lf('a', 'B', 'c', 'D', 'e', 'F', 'g', 'h', 'i'))
    expect(computeRangeStates(fourKinds, result)).toEqual([
      { kind: 'input1' },
      { kind: 'input2' },
      { kind: 'input1' },
      { kind: 'base' }
    ])
  })

  it('groups touching edits into one range with input ranges shifted per side', () => {
    expect(adjacent.ranges).toHaveLength(1)
    expect(adjacent.ranges[0]).toMatchObject({
      base: { start: 2, endExclusive: 4 },
      input1: { start: 2, endExclusive: 4 },
      input2: { start: 2, endExclusive: 4 },
      isConflicting: true,
      canBeCombined: true,
      isOrderRelevant: false
    })
  })

  it('treats an empty base (both added) as an order-relevant insertion conflict', () => {
    expect(bothAdded.ranges).toHaveLength(1)
    expect(bothAdded.ranges[0]).toMatchObject({
      base: { start: 1, endExclusive: 1 },
      input1: { start: 1, endExclusive: 3 },
      input2: { start: 1, endExclusive: 2 },
      isConflicting: true,
      canBeCombined: true,
      isOrderRelevant: true
    })
    expect(computeAutoMergedResult(bothAdded)).toBe('')
  })
})

describe('applyRangeState', () => {
  const base = computeAutoMergedResult(adjacent)

  it.each<[string, MergeRangeState, string]>([
    ['input1', { kind: 'input1' }, lf('a', 'B', 'c', 'd')],
    ['input2', { kind: 'input2' }, lf('a', 'b', 'C', 'd')],
    ['smart combination', { kind: 'both', firstInput: 1, smart: true }, lf('a', 'B', 'C', 'd')],
    [
      'dumb, input1 first',
      { kind: 'both', firstInput: 1, smart: false },
      lf('a', 'B', 'c', 'b', 'C', 'd')
    ],
    [
      'dumb, input2 first',
      { kind: 'both', firstInput: 2, smart: false },
      lf('a', 'b', 'C', 'B', 'c', 'd')
    ],
    ['base', { kind: 'base' }, lf('a', 'b', 'c', 'd')]
  ])('writes the %s lines for the range', (_name, state, expected) => {
    expect(applyRangeState(adjacent, base, 0, state)).toBe(expected)
  })

  it('orders a smart combination by firstInput when both sides insert at one point', () => {
    const smart = (firstInput: 1 | 2): MergeRangeState => ({
      kind: 'both',
      firstInput,
      smart: true
    })
    expect(applyRangeState(bothAdded, '', 0, smart(1))).toBe(lf('x', 'y', 'z'))
    expect(applyRangeState(bothAdded, '', 0, smart(2))).toBe(lf('z', 'x', 'y'))
  })

  it('puts an insertion before a replacement at the same base line regardless of order', () => {
    const doc = createMergeDocument({
      base: lf('a', 'b', 'c'),
      input1: lf('a', 'X', 'b', 'c'),
      input2: lf('a', 'B', 'c'),
      eol: '\n'
    })
    expect(doc.ranges[0]).toMatchObject({ canBeCombined: true, isOrderRelevant: false })
    const state: MergeRangeState = { kind: 'both', firstInput: 2, smart: true }
    expect(applyRangeState(doc, computeAutoMergedResult(doc), 0, state)).toBe(
      lf('a', 'X', 'B', 'c')
    )
  })

  it('falls back to a dumb combination where the sides replace the same lines', () => {
    const conflict = fourKinds.ranges[3]
    expect(conflict.canBeCombined).toBe(false)
    const result = applyRangeState(fourKinds, computeAutoMergedResult(fourKinds), 3, {
      kind: 'both',
      firstInput: 1,
      smart: true
    })
    expect(result).toBe(lf('a', 'B', 'c', 'D', 'e', 'F', 'g', 'H1', 'H2', 'i'))
    expect(computeRangeStates(fourKinds, result)[3]).toEqual({
      kind: 'both',
      firstInput: 1,
      smart: false
    })
  })

  it.each<[string, number, MergeRangeState, MergeDocument]>([
    ['input1', 0, { kind: 'input1' }, adjacent],
    ['input2', 0, { kind: 'input2' }, adjacent],
    ['smart both', 0, { kind: 'both', firstInput: 1, smart: true }, adjacent],
    ['dumb both 2-first', 0, { kind: 'both', firstInput: 2, smart: false }, adjacent],
    [
      'smart both 2-first on an order-relevant range',
      0,
      { kind: 'both', firstInput: 2, smart: true },
      bothAdded
    ],
    ['base on a one-sided range', 1, { kind: 'base' }, fourKinds],
    ['input2 on a true conflict', 3, { kind: 'input2' }, fourKinds]
  ])('reads %s back from the result it wrote', (_name, rangeId, state, doc) => {
    const result = applyRangeState(doc, computeAutoMergedResult(doc), rangeId, state)
    const states = computeRangeStates(doc, result)
    expect(states[rangeId]).toEqual(state)
    expect(states.filter((_, id) => id !== rangeId)).toEqual(
      computeRangeStates(doc, computeAutoMergedResult(doc)).filter((_, id) => id !== rangeId)
    )
  })
})

describe('computeRangeStates after manual edits', () => {
  const auto = computeAutoMergedResult(fourKinds)

  it('marks a hand-edited range unrecognized and leaves the others alone', () => {
    const edited = auto.replace('B\n', 'B!\n').replace('h\n', 'hand merged\n')
    expect(computeRangeStates(fourKinds, edited)).toEqual([
      { kind: 'unrecognized' },
      { kind: 'input2' },
      { kind: 'input1' },
      { kind: 'unrecognized' }
    ])
  })

  it('counts an edit on a neighbouring line as part of the range, but not one further away', () => {
    const doc = createMergeDocument({
      base: lf('a', 'b', 'c', 'd'),
      input1: lf('a', 'B', 'c', 'd'),
      input2: lf('a', 'b', 'c', 'd'),
      eol: '\n'
    })
    const merged = computeAutoMergedResult(doc)
    expect(computeRangeStates(doc, merged.replace('d\n', 'D\n'))).toEqual([{ kind: 'input1' }])
    expect(computeRangeStates(doc, merged.replace('c\n', 'C\n'))).toEqual([
      { kind: 'unrecognized' }
    ])
  })
})

describe('ranges at the start and end of the file', () => {
  const doc = createMergeDocument({
    base: lf('a', 'b', 'c'),
    input1: lf('b', 'c'),
    input2: lf('a', 'b', 'c', 'd'),
    eol: '\n'
  })

  it('maps a deleted first line and an appended last line into the result', () => {
    const auto = computeAutoMergedResult(doc)
    expect(auto).toBe(lf('b', 'c', 'd'))
    expect(getResultLineRange(doc, auto, 0)).toEqual({ start: 1, endExclusive: 1 })
    expect(getResultLineRange(doc, auto, 1)).toEqual({ start: 3, endExclusive: 4 })
    const restored = applyRangeState(doc, applyRangeState(doc, auto, 1, { kind: 'base' }), 0, {
      kind: 'base'
    })
    expect(restored).toBe(lf('a', 'b', 'c'))
  })

  it('reports the same states and result ranges from one layout pass', () => {
    const auto = computeAutoMergedResult(doc)
    expect(computeResultLayout(doc, auto)).toEqual({
      states: computeRangeStates(doc, auto),
      resultRanges: [getResultLineRange(doc, auto, 0), getResultLineRange(doc, auto, 1)]
    })
  })
})

describe('line endings', () => {
  it('joins with the document EOL even when the inputs use LF', () => {
    const doc = createMergeDocument({
      base: lf('a', 'b', 'c'),
      input1: lf('A', 'b', 'c'),
      input2: 'a\r\nb\r\nC\r\n',
      eol: '\r\n'
    })
    const auto = computeAutoMergedResult(doc)
    expect(auto).toBe('A\r\nb\r\nC\r\n')
    expect(applyRangeState(doc, auto, 0, { kind: 'base' })).toBe('a\r\nb\r\nC\r\n')
  })

  it('keeps a missing final newline missing', () => {
    const doc = createMergeDocument({ base: 'a\nb', input1: 'A\nb', input2: 'a\nb', eol: '\n' })
    expect(computeAutoMergedResult(doc)).toBe('A\nb')
  })

  it.each([
    ['a\r\nb\r\n', '\r\n'],
    ['a\nb', '\n'],
    ['', '\n'],
    ['a\r\nb\nc\r\n', '\r\n'],
    ['a\nb\nc\r\n', '\n']
  ])('detects the majority EOL of %j', (text, eol) => {
    expect(detectEol(text)).toBe(eol)
  })
})

describe('withInputValue', () => {
  const both = (firstInput: 1 | 2, smart = false): MergeRangeState => ({
    kind: 'both',
    firstInput,
    smart
  })

  it.each<[string, MergeRangeState, 1 | 2, boolean, MergeRangeState]>([
    ['base +1', { kind: 'base' }, 1, true, { kind: 'input1' }],
    ['base +2', { kind: 'base' }, 2, true, { kind: 'input2' }],
    ['input1 +2', { kind: 'input1' }, 2, true, both(1)],
    ['input2 +1', { kind: 'input2' }, 1, true, both(2)],
    ['both -1', both(2, true), 1, false, { kind: 'input2' }],
    ['both -2', both(1, true), 2, false, { kind: 'input1' }],
    ['input1 -1', { kind: 'input1' }, 1, false, { kind: 'base' }],
    ['input2 -1', { kind: 'input2' }, 1, false, { kind: 'input2' }],
    ['unrecognized +2', { kind: 'unrecognized' }, 2, true, { kind: 'input2' }],
    ['unrecognized -1', { kind: 'unrecognized' }, 1, false, { kind: 'unrecognized' }]
  ])('%s', (_name, state, input, value, expected) => {
    expect(withInputValue(state, input, value)).toEqual(expected)
  })

  it('carries the smart flag into a new combination', () => {
    expect(withInputValue({ kind: 'input1' }, 2, true, true)).toEqual(both(1, true))
  })
})

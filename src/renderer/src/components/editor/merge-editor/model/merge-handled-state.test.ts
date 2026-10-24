import { describe, expect, it } from 'vitest'
import {
  computeAutoMergedResult,
  computeRangeStates,
  createMergeDocument,
  type MergeRangeState
} from './merge-editor-model'
import {
  countUnhandledRanges,
  createMergeHandledState,
  reduceMergeHandledState,
  unhandledRangeIds
} from './merge-handled-state'

const lf = (...lines: string[]): string => lines.map((line) => `${line}\n`).join('')

// b: input1 only, d: identical on both sides, f: a true conflict.
const doc = createMergeDocument({
  base: lf('a', 'b', 'c', 'd', 'e', 'f', 'g'),
  input1: lf('a', 'B', 'c', 'D', 'e', 'F1', 'g'),
  input2: lf('a', 'b', 'c', 'D', 'e', 'F2', 'g'),
  eol: '\n'
})
const auto = computeAutoMergedResult(doc)
const reset = createMergeHandledState(doc, computeRangeStates(doc, auto), { reset: true })

describe('createMergeHandledState', () => {
  it('after a reset leaves only true conflicts unhandled', () => {
    expect(unhandledRangeIds(reset)).toEqual([2])
    expect(countUnhandledRanges(reset)).toBe(1)
  })

  it('without a reset treats ranges reading as base or unrecognized as unhandled', () => {
    const states: MergeRangeState[] = [
      { kind: 'base' },
      { kind: 'input2' },
      { kind: 'unrecognized' }
    ]
    expect(unhandledRangeIds(createMergeHandledState(doc, states, { reset: false }))).toEqual([
      0, 2
    ])
  })
})

describe('reduceMergeHandledState', () => {
  it('handles a range on accept, even one accepted back to base', () => {
    const next = reduceMergeHandledState(reset, {
      kind: 'accept',
      rangeId: 2,
      state: { kind: 'base' }
    })
    expect(countUnhandledRanges(next)).toBe(0)
    const reread = reduceMergeHandledState(next, {
      kind: 'resultEdited',
      states: computeRangeStates(doc, auto)
    })
    expect(countUnhandledRanges(reread)).toBe(0)
  })

  it('needs both inputs ignored before an ignored range counts as handled', () => {
    const once = reduceMergeHandledState(reset, { kind: 'ignore', rangeId: 2, input: 1 })
    expect(once.handled[2]).toEqual({ input1: true, input2: false })
    expect(unhandledRangeIds(once)).toEqual([2])
    const twice = reduceMergeHandledState(once, { kind: 'ignore', rangeId: 2, input: 2 })
    expect(unhandledRangeIds(twice)).toEqual([])
  })

  it('recomputes only ranges whose state a manual edit changed', () => {
    const ignored = reduceMergeHandledState(reset, { kind: 'ignore', rangeId: 2, input: 1 })
    const editedToBase = auto.replace('B\n', 'b\n')
    const afterRevert = reduceMergeHandledState(ignored, {
      kind: 'resultEdited',
      states: computeRangeStates(doc, editedToBase)
    })
    expect(afterRevert.handled[0]).toEqual({ input1: false, input2: false })
    expect(afterRevert.handled[2]).toEqual({ input1: true, input2: false })

    const resolvedByHand = reduceMergeHandledState(afterRevert, {
      kind: 'resultEdited',
      states: computeRangeStates(doc, editedToBase.replace('f\n', 'F2\n'))
    })
    expect(resolvedByHand.states[2]).toEqual({ kind: 'input2' })
    expect(unhandledRangeIds(resolvedByHand)).toEqual([0])
  })
})

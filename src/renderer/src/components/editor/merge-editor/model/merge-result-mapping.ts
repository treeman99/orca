import type {
  LineDiff,
  LineRange,
  MergeDocument,
  MergeRange,
  MergeRangeState
} from './merge-editor-types'
import { computeLineDiffs } from './merge-line-diff'
import { projectBaseRange } from './merge-line-range'
import { linesForState, smartCombineLines } from './merge-range-combination'
import { joinLines, linesEqual, sliceLines, splitLines } from './merge-text-lines'

export type ResultView = { lines: string[]; diffs: LineDiff[] }

export type RangeInResult = {
  /** Result lines for the range, widened by base lines that touching result edits also cover. */
  output: LineRange
  padBefore: string[]
  padAfter: string[]
}

// Why: O8 order — base first, so an untouched side never claims a range it did not change.
const STATE_CANDIDATES: readonly MergeRangeState[] = [
  { kind: 'base' },
  { kind: 'input1' },
  { kind: 'input2' },
  { kind: 'both', firstInput: 1, smart: true },
  { kind: 'both', firstInput: 2, smart: true },
  { kind: 'both', firstInput: 1, smart: false },
  { kind: 'both', firstInput: 2, smart: false }
]

export function createResultView(doc: MergeDocument, resultText: string): ResultView {
  const lines = splitLines(resultText)
  return { lines, diffs: computeLineDiffs(doc.baseLines, lines) }
}

function requireRange(doc: MergeDocument, rangeId: number): MergeRange {
  const range = doc.ranges[rangeId]
  if (range?.id !== rangeId) {
    throw new RangeError(`Unknown merge range id ${rangeId}`)
  }
  return range
}

export function locateRangeInResult(
  doc: MergeDocument,
  view: ResultView,
  range: MergeRange
): RangeInResult {
  const projection = projectBaseRange(view.diffs, range.base)
  return {
    output: projection.output,
    padBefore: sliceLines(doc.baseLines, {
      start: projection.base.start,
      endExclusive: range.base.start
    }),
    padAfter: sliceLines(doc.baseLines, {
      start: range.base.endExclusive,
      endExclusive: projection.base.endExclusive
    })
  }
}

export function trimmedResultRange(located: RangeInResult): LineRange {
  const start = located.output.start + located.padBefore.length
  return {
    start,
    endExclusive: Math.max(start, located.output.endExclusive - located.padAfter.length)
  }
}

export function inferRangeState(
  doc: MergeDocument,
  view: ResultView,
  range: MergeRange,
  located: RangeInResult
): MergeRangeState {
  const actual = sliceLines(view.lines, located.output)
  for (const candidate of STATE_CANDIDATES) {
    // Why: a smart candidate that cannot combine must not match through the dumb fallback.
    const lines =
      candidate.kind === 'both' && candidate.smart
        ? smartCombineLines(doc, range, candidate.firstInput)
        : linesForState(doc, range, candidate)
    if (lines && linesEqual(actual, [...located.padBefore, ...lines, ...located.padAfter])) {
      return { ...candidate }
    }
  }
  return { kind: 'unrecognized' }
}

export function computeRangeStates(doc: MergeDocument, resultText: string): MergeRangeState[] {
  const view = createResultView(doc, resultText)
  return doc.ranges.map((range) =>
    inferRangeState(doc, view, range, locateRangeInResult(doc, view, range))
  )
}

/** Range states and result line ranges from one result diff, for callers that need both. */
export function computeResultLayout(
  doc: MergeDocument,
  resultText: string
): { states: MergeRangeState[]; resultRanges: LineRange[] } {
  const view = createResultView(doc, resultText)
  const located = doc.ranges.map((range) => locateRangeInResult(doc, view, range))
  return {
    states: doc.ranges.map((range, index) => inferRangeState(doc, view, range, located[index])),
    resultRanges: located.map(trimmedResultRange)
  }
}

export function getResultLineRange(
  doc: MergeDocument,
  resultText: string,
  rangeId: number
): LineRange {
  const range = requireRange(doc, rangeId)
  const view = createResultView(doc, resultText)
  return trimmedResultRange(locateRangeInResult(doc, view, range))
}

export function applyRangeState(
  doc: MergeDocument,
  resultText: string,
  rangeId: number,
  state: MergeRangeState
): string {
  const range = requireRange(doc, rangeId)
  const lines = linesForState(doc, range, state)
  if (!lines) {
    return resultText
  }
  const view = createResultView(doc, resultText)
  const located = locateRangeInResult(doc, view, range)
  // Why: touching result edits were attributed to this range, so they are replaced with it.
  const next = [
    view.lines.slice(0, located.output.start - 1),
    located.padBefore,
    lines,
    located.padAfter,
    view.lines.slice(located.output.endExclusive - 1)
  ]
  return joinLines(next.flat(), doc.eol)
}

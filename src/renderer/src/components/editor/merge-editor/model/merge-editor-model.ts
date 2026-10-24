import type { MergeDocument, MergeEol, MergeRange, MergeRangeState } from './merge-editor-types'
import { computeLineDiffs } from './merge-line-diff'
import { alignMergeRanges } from './merge-range-alignment'
import { linesForState } from './merge-range-combination'
import { joinLines, sliceLines, splitLines } from './merge-text-lines'

export type {
  InputNumber,
  LineDiff,
  LineRange,
  MergeDocument,
  MergeEol,
  MergeRange,
  MergeRangeState
} from './merge-editor-types'
export {
  applyRangeState,
  computeRangeStates,
  computeResultLayout,
  getResultLineRange
} from './merge-result-mapping'
export { withInputValue } from './merge-range-state'
export { hasConflictMarkers, resultWithConflictMarkers } from './merge-conflict-markers'
export { reconstructInputsFromMarkers } from './merge-marker-reconstruction'
export { detectEol } from './merge-text-lines'

export function createMergeDocument(args: {
  base: string
  input1: string
  input2: string
  eol: MergeEol
}): MergeDocument {
  const lines = {
    baseLines: splitLines(args.base),
    input1Lines: splitLines(args.input1),
    input2Lines: splitLines(args.input2)
  }
  const ranges = alignMergeRanges(
    lines,
    computeLineDiffs(lines.baseLines, lines.input1Lines),
    computeLineDiffs(lines.baseLines, lines.input2Lines)
  )
  return { ...lines, ranges, eol: args.eol }
}

function autoMergedState(range: MergeRange): MergeRangeState {
  if (range.input2Diffs.length === 0 || range.isEqualChange) {
    return { kind: 'input1' }
  }
  return range.input1Diffs.length === 0 ? { kind: 'input2' } : { kind: 'base' }
}

/** Takes every one-sided or identical change and leaves true conflicts at base (O6). */
export function computeAutoMergedResult(doc: MergeDocument): string {
  const chunks: string[][] = []
  let cursor = 1
  for (const range of doc.ranges) {
    chunks.push(
      sliceLines(doc.baseLines, { start: cursor, endExclusive: range.base.start }),
      linesForState(doc, range, autoMergedState(range)) ?? []
    )
    cursor = range.base.endExclusive
  }
  chunks.push(sliceLines(doc.baseLines, { start: cursor, endExclusive: doc.baseLines.length + 1 }))
  // Why: flat() rather than push(...lines), whose argument count overflows on huge files.
  return joinLines(chunks.flat(), doc.eol)
}

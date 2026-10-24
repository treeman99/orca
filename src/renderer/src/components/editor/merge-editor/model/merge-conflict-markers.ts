import type { InputNumber, MergeDocument } from './merge-editor-types'
import { rangeLinesOf } from './merge-range-combination'
import {
  createResultView,
  inferRangeState,
  locateRangeInResult,
  trimmedResultRange
} from './merge-result-mapping'
import { joinLines, sliceLines } from './merge-text-lines'

export const CONFLICT_START_MARKER = '<<<<<<<'
export const CONFLICT_BASE_MARKER = '|||||||'
export const CONFLICT_SEPARATOR_MARKER = '======='
export const CONFLICT_END_MARKER = '>>>>>>>'

export function isConflictMarkerLine(line: string, marker: string): boolean {
  return line === marker || line.startsWith(`${marker} `)
}

export function hasConflictMarkers(text: string): boolean {
  return /^<<<<<<</m.test(text)
}

function markerLine(marker: string, label: string | undefined): string {
  return label ? `${marker} ${label}` : marker
}

/**
 * Wraps each unhandled range of the result in conflict markers (O12/D4). `firstInput` picks the
 * side written first; a hand-merged (unrecognized) range keeps its result text in that block.
 */
export function resultWithConflictMarkers(
  doc: MergeDocument,
  resultText: string,
  unhandledRangeIds: number[],
  labels?: { input1?: string; input2?: string },
  firstInput: InputNumber = 1
): string {
  const unhandled = new Set(unhandledRangeIds)
  const secondInput: InputNumber = firstInput === 1 ? 2 : 1
  const labelOf = (input: InputNumber): string | undefined =>
    input === 1 ? labels?.input1 : labels?.input2
  const view = createResultView(doc, resultText)
  const chunks: string[][] = []
  let cursor = 1
  for (const range of doc.ranges) {
    if (!unhandled.has(range.id)) {
      continue
    }
    const located = locateRangeInResult(doc, view, range)
    const trimmed = trimmedResultRange(located)
    // Why: one result edit can span two ranges; clamping keeps every result line exactly once.
    const start = Math.max(trimmed.start, cursor)
    const resultRange = { start, endExclusive: Math.max(trimmed.endExclusive, start) }
    const state = inferRangeState(doc, view, range, located)
    chunks.push(
      sliceLines(view.lines, { start: cursor, endExclusive: resultRange.start }),
      [markerLine(CONFLICT_START_MARKER, labelOf(firstInput))],
      state.kind === 'unrecognized'
        ? sliceLines(view.lines, resultRange)
        : rangeLinesOf(doc, range, firstInput),
      [CONFLICT_SEPARATOR_MARKER],
      rangeLinesOf(doc, range, secondInput),
      [markerLine(CONFLICT_END_MARKER, labelOf(secondInput))]
    )
    cursor = resultRange.endExclusive
  }
  chunks.push(sliceLines(view.lines, { start: cursor, endExclusive: view.lines.length + 1 }))
  return joinLines(chunks.flat(), doc.eol)
}

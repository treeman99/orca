import type { editor } from 'monaco-editor'
import { stateIncludesInput } from './merge-editor-range-actions'
import type { MergeSide } from './merge-editor-session'
import type {
  InputNumber,
  LineRange,
  MergeDocument,
  MergeRangeState
} from './model/merge-editor-model'
import { isRangeHandled, type InputsHandled } from './model/merge-handled-state'

function lineRangeDecoration(
  range: LineRange,
  lineCount: number,
  className: string
): editor.IModelDeltaDecoration {
  if (range.start < range.endExclusive) {
    return {
      range: {
        startLineNumber: range.start,
        startColumn: 1,
        endLineNumber: range.endExclusive - 1,
        endColumn: 1
      },
      options: { isWholeLine: true, className, linesDecorationsClassName: 'orca-merge-gutter' }
    }
  }
  // Why: an empty range is an insertion point between lines; mark the boundary instead.
  const pastEnd = range.start > lineCount
  const line = Math.max(1, Math.min(range.start, lineCount))
  return {
    range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
    options: {
      isWholeLine: true,
      className: `${className} ${pastEnd ? 'is-gap-after' : 'is-gap-before'}`
    }
  }
}

export function countLines(text: string): number {
  return (text.match(/\r\n|\r|\n/g)?.length ?? 0) + 1
}

/** One input pane: each range's side in that input, tinted by side and marked when in the result. */
export function inputPaneDecorations(
  doc: MergeDocument,
  states: readonly MergeRangeState[],
  input: InputNumber,
  side: MergeSide
): editor.IModelDeltaDecoration[] {
  const lineCount = (input === 1 ? doc.input1Lines : doc.input2Lines).length
  return doc.ranges.map((range, id) => {
    const classes = [
      'orca-merge-range',
      side === 'ours' ? 'is-current' : 'is-incoming',
      range.isConflicting ? 'is-conflict' : '',
      states[id] && stateIncludesInput(states[id], input) ? 'is-accepted' : ''
    ]
    return lineRangeDecoration(
      input === 1 ? range.input1 : range.input2,
      lineCount,
      classes.filter(Boolean).join(' ')
    )
  })
}

/** The result pane: where each range landed, flagged until it is handled. */
export function resultPaneDecorations(
  doc: MergeDocument,
  resultRanges: readonly LineRange[],
  handled: readonly InputsHandled[],
  resultLineCount: number
): editor.IModelDeltaDecoration[] {
  return doc.ranges.flatMap((range, id) => {
    const resultRange = resultRanges[id]
    if (!resultRange) {
      return []
    }
    const done = handled[id] ? isRangeHandled(handled[id]) : true
    const classes = [
      'orca-merge-result-range',
      done ? 'is-handled' : 'is-unhandled',
      range.isConflicting ? 'is-conflict' : ''
    ]
    return [lineRangeDecoration(resultRange, resultLineCount, classes.filter(Boolean).join(' '))]
  })
}

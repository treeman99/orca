import type {
  InputNumber,
  LineDiff,
  MergeLines,
  MergeRangeEdits,
  MergeRangeState
} from './merge-editor-types'
import { inputLines, sliceLines } from './merge-text-lines'

type InputEdit = { diff: LineDiff; input: InputNumber }

function otherInput(input: InputNumber): InputNumber {
  return input === 1 ? 2 : 1
}

export function rangeLinesOf(
  lines: MergeLines,
  range: MergeRangeEdits,
  input: InputNumber
): string[] {
  return sliceLines(inputLines(lines, input), input === 1 ? range.input1 : range.input2)
}

/**
 * Both sides' edits woven into base in base order, or undefined when two edits claim the
 * same base lines. Equal starts put the shorter base range first so an insertion and a
 * replacement at one line still combine; identical ranges go `firstInput` first.
 */
export function smartCombineLines(
  lines: MergeLines,
  range: MergeRangeEdits,
  firstInput: InputNumber
): string[] | undefined {
  const rank = (edit: InputEdit): number => (edit.input === firstInput ? 0 : 1)
  const edits: InputEdit[] = [
    ...range.input1Diffs.map((diff) => ({ diff, input: 1 as const })),
    ...range.input2Diffs.map((diff) => ({ diff, input: 2 as const }))
  ].sort(
    (a, b) =>
      a.diff.base.start - b.diff.base.start ||
      a.diff.base.endExclusive - b.diff.base.endExclusive ||
      rank(a) - rank(b)
  )
  const chunks: string[][] = []
  let cursor = range.base.start
  for (const edit of edits) {
    if (edit.diff.base.start < cursor) {
      return undefined
    }
    chunks.push(
      sliceLines(lines.baseLines, { start: cursor, endExclusive: edit.diff.base.start }),
      sliceLines(inputLines(lines, edit.input), edit.diff.input)
    )
    cursor = edit.diff.base.endExclusive
  }
  chunks.push(sliceLines(lines.baseLines, { start: cursor, endExclusive: range.base.endExclusive }))
  return chunks.flat()
}

function dumbCombineLines(
  lines: MergeLines,
  range: MergeRangeEdits,
  firstInput: InputNumber
): string[] {
  return [
    ...rangeLinesOf(lines, range, firstInput),
    ...rangeLinesOf(lines, range, otherInput(firstInput))
  ]
}

/** Result lines a state stands for; undefined for `unrecognized`, which has no canonical text. */
export function linesForState(
  lines: MergeLines,
  range: MergeRangeEdits,
  state: MergeRangeState
): string[] | undefined {
  switch (state.kind) {
    case 'base':
      return sliceLines(lines.baseLines, range.base)
    case 'input1':
      return rangeLinesOf(lines, range, 1)
    case 'input2':
      return rangeLinesOf(lines, range, 2)
    case 'both':
      return (
        (state.smart ? smartCombineLines(lines, range, state.firstInput) : undefined) ??
        dumbCombineLines(lines, range, state.firstInput)
      )
    case 'unrecognized':
      return undefined
  }
}

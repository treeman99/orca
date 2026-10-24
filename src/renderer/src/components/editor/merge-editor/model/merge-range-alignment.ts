import type { LineDiff, LineRange, MergeLines, MergeRange } from './merge-editor-types'
import { projectBaseRange } from './merge-line-range'
import { rangeLinesOf, smartCombineLines } from './merge-range-combination'
import { linesEqual } from './merge-text-lines'

/** Groups both sides' diffs whose base ranges overlap or touch into merge ranges (O5). */
export function alignMergeRanges(
  lines: MergeLines,
  input1Diffs: readonly LineDiff[],
  input2Diffs: readonly LineDiff[]
): MergeRange[] {
  const groupBases: LineRange[] = []
  const sortedBases = [...input1Diffs, ...input2Diffs]
    .map((diff) => diff.base)
    .sort((a, b) => a.start - b.start)
  for (const base of sortedBases) {
    const current = groupBases.at(-1)
    if (current && base.start <= current.endExclusive) {
      current.endExclusive = Math.max(current.endExclusive, base.endExclusive)
    } else {
      groupBases.push({ ...base })
    }
  }
  return groupBases.map((base, id) => createMergeRange(lines, id, base, input1Diffs, input2Diffs))
}

function createMergeRange(
  lines: MergeLines,
  id: number,
  base: LineRange,
  allInput1Diffs: readonly LineDiff[],
  allInput2Diffs: readonly LineDiff[]
): MergeRange {
  // Why: each group spans its diffs, so the touching diffs are exactly this group's diffs.
  const side1 = projectBaseRange(allInput1Diffs, base)
  const side2 = projectBaseRange(allInput2Diffs, base)
  const edits = {
    base,
    input1: side1.output,
    input2: side2.output,
    input1Diffs: side1.touching,
    input2Diffs: side2.touching
  }
  const isConflicting = edits.input1Diffs.length > 0 && edits.input2Diffs.length > 0
  const smartFirst1 = smartCombineLines(lines, edits, 1)
  const smartFirst2 = smartCombineLines(lines, edits, 2)
  return {
    id,
    ...edits,
    isConflicting,
    isEqualChange:
      isConflicting && linesEqual(rangeLinesOf(lines, edits, 1), rangeLinesOf(lines, edits, 2)),
    canBeCombined: smartFirst1 !== undefined,
    isOrderRelevant:
      smartFirst1 !== undefined &&
      smartFirst2 !== undefined &&
      !linesEqual(smartFirst1, smartFirst2)
  }
}

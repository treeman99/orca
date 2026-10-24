/** 1-based line range; `start === endExclusive` is an empty range (an insertion point). */
export type LineRange = { start: number; endExclusive: number }

/** The base lines in `base` were replaced by the input lines in `input`. */
export type LineDiff = { base: LineRange; input: LineRange }

export type InputNumber = 1 | 2

export type MergeEol = '\n' | '\r\n'

export type MergeRangeState =
  | { kind: 'base' }
  | { kind: 'input1' }
  | { kind: 'input2' }
  | { kind: 'both'; firstInput: InputNumber; smart: boolean }
  | { kind: 'unrecognized' }

export type MergeRange = {
  id: number
  base: LineRange
  input1: LineRange
  input2: LineRange
  input1Diffs: LineDiff[]
  input2Diffs: LineDiff[]
  isConflicting: boolean
  isEqualChange: boolean
  canBeCombined: boolean
  isOrderRelevant: boolean
}

export type MergeDocument = {
  baseLines: string[]
  input1Lines: string[]
  input2Lines: string[]
  ranges: MergeRange[]
  eol: MergeEol
}

export type MergeLines = Pick<MergeDocument, 'baseLines' | 'input1Lines' | 'input2Lines'>

export type MergeRangeEdits = Pick<
  MergeRange,
  'base' | 'input1' | 'input2' | 'input1Diffs' | 'input2Diffs'
>

import {
  withInputValue,
  type InputNumber,
  type LineRange,
  type MergeRange,
  type MergeRangeState
} from './model/merge-editor-model'
import { isRangeHandled, type InputsHandled } from './model/merge-handled-state'

export type MergeInputAction =
  | { kind: 'accept'; state: MergeRangeState }
  /** `orderRelevant`: the label names which side goes first. */
  | { kind: 'combine'; state: MergeRangeState; orderRelevant: boolean }
  | { kind: 'ignore' }

export type MergeResultLabel =
  | { kind: 'manual' }
  | { kind: 'none' }
  | { kind: 'inputs'; inputs: InputNumber[] }

export function stateIncludesInput(state: MergeRangeState, input: InputNumber): boolean {
  return state.kind === 'both' || state.kind === (input === 1 ? 'input1' : 'input2')
}

/** Ranges worth annotating: conflicts always, other changes only until they are handled (O10). */
export function shouldAnnotateRange(range: MergeRange, handled: InputsHandled): boolean {
  return range.isConflicting || !isRangeHandled(handled)
}

/** The actions above one input's side of a range (O10, first-pass scope D10). */
export function inputRangeActions(
  range: MergeRange,
  state: MergeRangeState,
  handled: InputsHandled,
  input: InputNumber
): MergeInputAction[] {
  if (!shouldAnnotateRange(range, handled)) {
    return []
  }
  const actions: MergeInputAction[] = []
  if (!stateIncludesInput(state, input) && state.kind !== 'unrecognized') {
    actions.push({ kind: 'accept', state: withInputValue(state, input, true) })
    if (range.canBeCombined) {
      actions.push({
        kind: 'combine',
        state: { kind: 'both', firstInput: input, smart: true },
        orderRelevant: range.isOrderRelevant
      })
    }
  }
  if (!(input === 1 ? handled.input1 : handled.input2)) {
    actions.push({ kind: 'ignore' })
  }
  return actions
}

export function resultRangeLabel(state: MergeRangeState): MergeResultLabel {
  switch (state.kind) {
    case 'unrecognized':
      return { kind: 'manual' }
    case 'base':
      return { kind: 'none' }
    case 'input1':
      return { kind: 'inputs', inputs: [1] }
    case 'input2':
      return { kind: 'inputs', inputs: [2] }
    case 'both':
      return { kind: 'inputs', inputs: state.firstInput === 1 ? [1, 2] : [2, 1] }
  }
}

export function inputLineRange(range: MergeRange, input: InputNumber): LineRange {
  return input === 1 ? range.input1 : range.input2
}

/** Next unhandled range after `afterLine` in the result, wrapping to the first one. */
export function nextUnhandledRangeId(
  resultRanges: readonly LineRange[],
  unhandledIds: readonly number[],
  afterLine: number
): number | null {
  if (unhandledIds.length === 0) {
    return null
  }
  return unhandledIds.find((id) => (resultRanges[id]?.start ?? 0) > afterLine) ?? unhandledIds[0]
}

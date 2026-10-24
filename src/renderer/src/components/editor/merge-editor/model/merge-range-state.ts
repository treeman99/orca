import type { InputNumber, MergeRangeState } from './merge-editor-types'

function onlyInput(input: InputNumber): MergeRangeState {
  return input === 1 ? { kind: 'input1' } : { kind: 'input2' }
}

/** Turns one input on or off in a range state (O7); unrecognized takes the input outright. */
export function withInputValue(
  state: MergeRangeState,
  input: InputNumber,
  value: boolean,
  smart = false
): MergeRangeState {
  switch (state.kind) {
    case 'base':
    case 'unrecognized':
      return value ? onlyInput(input) : state
    case 'input1':
    case 'input2': {
      const current: InputNumber = state.kind === 'input1' ? 1 : 2
      if (current === input) {
        return value ? state : { kind: 'base' }
      }
      return value ? { kind: 'both', firstInput: current, smart } : state
    }
    case 'both':
      return value ? state : onlyInput(input === 1 ? 2 : 1)
  }
}

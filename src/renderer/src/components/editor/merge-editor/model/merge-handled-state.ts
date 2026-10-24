import type { InputNumber, MergeDocument, MergeRange, MergeRangeState } from './merge-editor-types'

export type InputsHandled = { input1: boolean; input2: boolean }

/** Per-range view state, indexed by range id; `states` is what the result last showed. */
export type MergeHandledState = {
  states: MergeRangeState[]
  handled: InputsHandled[]
}

export type MergeHandledAction =
  /** An accept/remove/reset button applied `state` to the range. */
  | { kind: 'accept'; rangeId: number; state: MergeRangeState }
  | { kind: 'ignore'; rangeId: number; input: InputNumber }
  /** The result changed; `states` comes from computeRangeStates, in range order. */
  | { kind: 'resultEdited'; states: MergeRangeState[] }

function both(value: boolean): InputsHandled {
  return { input1: value, input2: value }
}

function handledByState(state: MergeRangeState): InputsHandled {
  return both(state.kind !== 'base' && state.kind !== 'unrecognized')
}

// Why: O6 reset leaves only true conflicts at base, and those are the ones still to resolve.
function handledByReset(range: MergeRange): InputsHandled {
  return both(!range.isConflicting || range.isEqualChange)
}

function sameState(a: MergeRangeState, b: MergeRangeState): boolean {
  if (a.kind === 'both' && b.kind === 'both') {
    return a.firstInput === b.firstInput && a.smart === b.smart
  }
  return a.kind === b.kind
}

export function createMergeHandledState(
  doc: MergeDocument,
  states: MergeRangeState[],
  options: { reset: boolean }
): MergeHandledState {
  const rangeStates = doc.ranges.map(
    (_, index): MergeRangeState => states[index] ?? { kind: 'unrecognized' }
  )
  return {
    states: rangeStates,
    handled: doc.ranges.map((range, index) =>
      options.reset ? handledByReset(range) : handledByState(rangeStates[index])
    )
  }
}

export function reduceMergeHandledState(
  current: MergeHandledState,
  action: MergeHandledAction
): MergeHandledState {
  switch (action.kind) {
    case 'accept':
      return {
        states: current.states.map((state, id) => (id === action.rangeId ? action.state : state)),
        handled: current.handled.map((handled, id) =>
          id === action.rangeId ? both(true) : handled
        )
      }
    case 'ignore':
      return {
        states: current.states,
        handled: current.handled.map((handled, id) =>
          id !== action.rangeId
            ? handled
            : action.input === 1
              ? { ...handled, input1: true }
              : { ...handled, input2: true }
        )
      }
    case 'resultEdited': {
      const states = current.states.map((state, id) => action.states[id] ?? state)
      return {
        states,
        handled: current.handled.map((handled, id) =>
          sameState(current.states[id], states[id]) ? handled : handledByState(states[id])
        )
      }
    }
  }
}

export function isRangeHandled(handled: InputsHandled): boolean {
  return handled.input1 && handled.input2
}

export function unhandledRangeIds(current: MergeHandledState): number[] {
  return current.handled.flatMap((handled, id) => (isRangeHandled(handled) ? [] : [id]))
}

export function countUnhandledRanges(current: MergeHandledState): number {
  return unhandledRangeIds(current).length
}

import type { MergeEditorSession, MergeInputSource } from './merge-editor-session'
import {
  computeAutoMergedResult,
  computeRangeStates,
  hasConflictMarkers,
  resultWithConflictMarkers
} from './model/merge-editor-model'
import {
  createMergeHandledState,
  unhandledRangeIds,
  type MergeHandledState
} from './model/merge-handled-state'

export type MergeViewState = { result: string; handled: MergeHandledState }

/** "Reset Result" (O13): one-sided and identical changes taken, true conflicts left at base. */
export function resetMergeViewState(session: MergeEditorSession): MergeViewState {
  const result = computeAutoMergedResult(session.doc)
  return {
    result,
    handled: createMergeHandledState(session.doc, computeRangeStates(session.doc, result), {
      reset: true
    })
  }
}

/**
 * Opening state (O6): a buffer still carrying conflict markers is recomputed from the inputs;
 * otherwise the buffer is the result and each range's state is read back from it.
 */
export function initialMergeViewState(
  session: MergeEditorSession,
  bufferText: string
): MergeViewState {
  if (hasConflictMarkers(bufferText)) {
    return resetMergeViewState(session)
  }
  return {
    result: bufferText,
    handled: createMergeHandledState(session.doc, computeRangeStates(session.doc, bufferText), {
      reset: false
    })
  }
}

function markerLabel(source: MergeInputSource): string {
  return (
    source.label?.refNames[0] ??
    source.label?.shortOid ??
    (source.side === 'ours' ? 'Current' : 'Incoming')
  )
}

/**
 * The text the editor gets back when the merge view closes (D4): every range still unhandled is
 * wrapped in markers again, Current first as git writes them, so the conflict stays visible.
 */
export function textEditorContentOnLeave(
  session: MergeEditorSession,
  result: string,
  handled: MergeHandledState
): string {
  const unhandled = unhandledRangeIds(handled)
  if (unhandled.length === 0) {
    return result
  }
  return resultWithConflictMarkers(
    session.doc,
    result,
    unhandled,
    { input1: markerLabel(session.inputs[0]), input2: markerLabel(session.inputs[1]) },
    session.currentInput
  )
}

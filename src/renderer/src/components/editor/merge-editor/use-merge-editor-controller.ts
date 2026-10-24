import { useCallback, useEffect, useRef, useState } from 'react'
import { cacheMergeSession } from './merge-editor-session-cache'
import { resetMergeViewState, textEditorContentOnLeave } from './merge-editor-result-state'
import type { MergeEditorSession } from './merge-editor-session'
import {
  applyRangeState,
  computeResultLayout,
  type InputNumber,
  type LineRange,
  type MergeRangeState
} from './model/merge-editor-model'
import {
  reduceMergeHandledState,
  unhandledRangeIds,
  type MergeHandledState
} from './model/merge-handled-state'

// Why: reading the states back diffs the whole result; typing must not pay that per keystroke.
const RESULT_LAYOUT_DEBOUNCE_MS = 150

export type MergeResultLayout = {
  text: string
  states: MergeRangeState[]
  resultRanges: LineRange[]
}

function layoutOf(session: MergeEditorSession, text: string): MergeResultLayout {
  return { text, ...computeResultLayout(session.doc, text) }
}

export type MergeEditorController = {
  layout: MergeResultLayout
  handled: MergeHandledState
  unhandledIds: number[]
  applyState: (rangeId: number, state: MergeRangeState) => void
  ignoreInput: (rangeId: number, input: InputNumber) => void
  resetResult: () => void
  /** Handled state caught up with the current result, for decisions that cannot wait out the debounce. */
  settledHandled: () => MergeHandledState
  contentOnLeave: () => string
}

export function useMergeEditorController({
  fileId,
  session,
  initialHandled,
  result,
  onContentChange
}: {
  fileId: string
  session: MergeEditorSession
  initialHandled: MergeHandledState
  result: string
  onContentChange: (content: string) => void
}): MergeEditorController {
  const [layout, setLayout] = useState(() => layoutOf(session, result))
  // Why: a cached session may predate edits made while the view was unmounted.
  const [handled, setHandled] = useState(() =>
    reduceMergeHandledState(initialHandled, { kind: 'resultEdited', states: layout.states })
  )
  const latestRef = useRef({ result, handled, layout, onContentChange })
  latestRef.current = { result, handled, layout, onContentChange }

  useEffect(() => {
    cacheMergeSession(fileId, { session, handled })
  }, [fileId, handled, session])

  useEffect(() => {
    if (result === layout.text) {
      return
    }
    const timer = window.setTimeout(() => {
      const next = layoutOf(session, result)
      setLayout(next)
      setHandled((current) =>
        reduceMergeHandledState(current, { kind: 'resultEdited', states: next.states })
      )
    }, RESULT_LAYOUT_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [layout.text, result, session])

  const applyState = useCallback(
    (rangeId: number, state: MergeRangeState) => {
      const next = applyRangeState(session.doc, latestRef.current.result, rangeId, state)
      setLayout(layoutOf(session, next))
      setHandled((current) => reduceMergeHandledState(current, { kind: 'accept', rangeId, state }))
      latestRef.current.onContentChange(next)
    },
    [session]
  )

  const ignoreInput = useCallback((rangeId: number, input: InputNumber) => {
    setHandled((current) => reduceMergeHandledState(current, { kind: 'ignore', rangeId, input }))
  }, [])

  const resetResult = useCallback(() => {
    const reset = resetMergeViewState(session)
    setLayout(layoutOf(session, reset.result))
    setHandled(reset.handled)
    latestRef.current.onContentChange(reset.result)
  }, [session])

  const settledHandled = useCallback((): MergeHandledState => {
    const { result: text, handled: current, layout: shown } = latestRef.current
    if (text === shown.text) {
      return current
    }
    return reduceMergeHandledState(current, {
      kind: 'resultEdited',
      states: computeResultLayout(session.doc, text).states
    })
  }, [session])

  const contentOnLeave = useCallback(
    () => textEditorContentOnLeave(session, latestRef.current.result, settledHandled()),
    [session, settledHandled]
  )

  return {
    layout,
    handled,
    unhandledIds: unhandledRangeIds(handled),
    applyState,
    ignoreInput,
    resetResult,
    settledHandled,
    contentOnLeave
  }
}

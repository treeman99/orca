import { useMemo } from 'react'
import type { editor } from 'monaco-editor'
import { countLines, inputPaneDecorations, resultPaneDecorations } from './merge-editor-decorations'
import { inputActionLabel, resetToBaseLabel, resultLabelText } from './merge-editor-labels'
import {
  inputLineRange,
  inputRangeActions,
  resultRangeLabel,
  shouldAnnotateRange
} from './merge-editor-range-actions'
import type { MergeEditorSession } from './merge-editor-session'
import type { MergeZoneSpec } from './use-merge-pane-annotations'
import type { MergeEditorController } from './use-merge-editor-controller'
import type { InputNumber } from './model/merge-editor-model'

type AnnotationSource = Pick<
  MergeEditorController,
  'layout' | 'handled' | 'applyState' | 'ignoreInput'
>

export type MergePaneAnnotations = {
  decorations: editor.IModelDeltaDecoration[]
  zones: MergeZoneSpec[]
}

function inputPaneZones(
  session: MergeEditorSession,
  controller: AnnotationSource,
  input: InputNumber,
  titles: readonly [string, string]
): MergeZoneSpec[] {
  const { layout, handled } = controller
  return session.doc.ranges.flatMap((range, id) => {
    const state = layout.states[id]
    const rangeHandled = handled.handled[id]
    if (!state || !rangeHandled) {
      return []
    }
    const actions = inputRangeActions(range, state, rangeHandled, input)
    if (actions.length === 0) {
      return []
    }
    return [
      {
        key: `range-${id}`,
        afterLineNumber: inputLineRange(range, input).start - 1,
        items: actions.map((action) => ({
          key: action.kind,
          label: inputActionLabel(action, titles[input - 1]),
          run: () =>
            action.kind === 'ignore'
              ? controller.ignoreInput(id, input)
              : controller.applyState(id, action.state)
        }))
      }
    ]
  })
}

function resultPaneZones(
  session: MergeEditorSession,
  controller: AnnotationSource,
  titles: readonly [string, string]
): MergeZoneSpec[] {
  const { layout, handled } = controller
  return session.doc.ranges.flatMap((range, id) => {
    const state = layout.states[id]
    const resultRange = layout.resultRanges[id]
    const rangeHandled = handled.handled[id]
    if (!state || !resultRange || !rangeHandled || !shouldAnnotateRange(range, rangeHandled)) {
      return []
    }
    return [
      {
        key: `range-${id}`,
        afterLineNumber: resultRange.start - 1,
        label: resultLabelText(resultRangeLabel(state), titles),
        items:
          state.kind === 'base'
            ? []
            : [
                {
                  key: 'reset',
                  label: resetToBaseLabel(),
                  run: () => controller.applyState(id, { kind: 'base' })
                }
              ]
      }
    ]
  })
}

/** Highlights and action bars for the two input panes and the result pane. */
export function useMergeEditorAnnotations(
  session: MergeEditorSession,
  controller: MergeEditorController,
  titles: readonly [string, string]
): { input1: MergePaneAnnotations; input2: MergePaneAnnotations; result: MergePaneAnnotations } {
  const [title1, title2] = titles
  const { layout, handled, applyState, ignoreInput } = controller
  return useMemo(() => {
    const paneTitles: readonly [string, string] = [title1, title2]
    const source: AnnotationSource = { layout, handled, applyState, ignoreInput }
    return {
      input1: {
        decorations: inputPaneDecorations(session.doc, layout.states, 1, session.inputs[0].side),
        zones: inputPaneZones(session, source, 1, paneTitles)
      },
      input2: {
        decorations: inputPaneDecorations(session.doc, layout.states, 2, session.inputs[1].side),
        zones: inputPaneZones(session, source, 2, paneTitles)
      },
      result: {
        decorations: resultPaneDecorations(
          session.doc,
          layout.resultRanges,
          handled.handled,
          countLines(layout.text)
        ),
        zones: resultPaneZones(session, source, paneTitles)
      }
    }
  }, [session, layout, handled, applyState, ignoreInput, title1, title2])
}

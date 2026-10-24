import React, { useCallback, useMemo, useRef, useState } from 'react'
import type { editor } from 'monaco-editor'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { translate } from '@/i18n/i18n'
import { stageRuntimeGitPath } from '@/runtime/runtime-git-working-tree-client'
import { ResizeHandle } from '@/components/tab-group/TabGroupSplitNodeTree'
import { installEditorSaveShortcut } from '../editor-shortcuts'
import { completeMerge } from './merge-editor-completion'
import { mergeEditorGitContext, refreshMergedFileStatus } from './merge-editor-git'
import { mergeSideTitle } from './merge-editor-labels'
import { mapLineThroughRanges } from './merge-editor-line-mapping'
import { nextUnhandledRangeId } from './merge-editor-range-actions'
import type { MergeEditorSession, MergeInputSource } from './merge-editor-session'
import { MergeCompleteDialogHost, useMergeCompleteConfirm } from './MergeCompleteDialog'
import { MergeEditorHeader } from './MergeEditorHeader'
import { MergeEditorPane, MergePaneTitle } from './MergeEditorPane'
import { useMergeEditorAnnotations } from './use-merge-editor-annotations'
import { useMergeEditorController } from './use-merge-editor-controller'
import {
  useMergeEditorScrollSync,
  type MergePaneEditors,
  type MergePaneId
} from './use-merge-editor-scroll-sync'
import { useMergePaneAnnotations } from './use-merge-pane-annotations'
import { useMergeViewLeaveGuard } from './use-merge-view-leave-guard'
import { countUnhandledRanges, type MergeHandledState } from './model/merge-handled-state'

const NO_EDITORS: MergePaneEditors = { input1: null, input2: null, result: null }

function inputPaneTitle(source: MergeInputSource): React.JSX.Element {
  return (
    <MergePaneTitle
      title={mergeSideTitle(source.side)}
      detail={source.label?.refNames.join(', ')}
      mono={source.label?.shortOid}
    />
  )
}

export function MergeEditorWorkspace({
  file,
  session,
  initialHandled,
  content,
  language,
  onContentChange,
  onSave
}: {
  file: OpenFile
  session: MergeEditorSession
  initialHandled: MergeHandledState
  content: string
  language: string
  onContentChange: (content: string) => void
  onSave: (content: string) => Promise<boolean>
}): React.JSX.Element {
  const setEditorViewMode = useAppStore((s) => s.setEditorViewMode)
  const controller = useMergeEditorController({
    fileId: file.id,
    session,
    initialHandled,
    result: content,
    onContentChange
  })
  const [editors, setEditors] = useState<MergePaneEditors>(NO_EDITORS)
  const [ratio, setRatio] = useState(0.5)
  const [completing, setCompleting] = useState(false)
  const leftRef = useRef(false)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const { confirmWithUnhandled, dialogState, settle } = useMergeCompleteConfirm()

  const restoreMarkers = (): void => {
    const next = controller.contentOnLeave()
    if (next !== content) {
      onContentChange(next)
    }
  }
  useMergeViewLeaveGuard(file.id, leftRef, restoreMarkers)

  const titles = useMemo<readonly [string, string]>(
    () => [mergeSideTitle(session.inputs[0].side), mergeSideTitle(session.inputs[1].side)],
    [session]
  )
  const annotations = useMergeEditorAnnotations(session, controller, titles)
  useMergePaneAnnotations(editors.input1, annotations.input1.decorations, annotations.input1.zones)
  useMergePaneAnnotations(editors.input2, annotations.input2.decorations, annotations.input2.zones)
  useMergePaneAnnotations(editors.result, annotations.result.decorations, annotations.result.zones)

  const rangesByPane = useMemo(
    () => ({
      input1: session.doc.ranges.map((range) => range.input1),
      input2: session.doc.ranges.map((range) => range.input2),
      result: controller.layout.resultRanges
    }),
    [controller.layout.resultRanges, session]
  )
  useMergeEditorScrollSync(editors, (from: MergePaneId, to: MergePaneId, line: number) =>
    mapLineThroughRanges(line, rangesByPane[from], rangesByPane[to])
  )

  const input1Text = useMemo(() => session.doc.input1Lines.join(session.doc.eol), [session])
  const input2Text = useMemo(() => session.doc.input2Lines.join(session.doc.eol), [session])
  const mountInput1 = useCallback((instance: editor.IStandaloneCodeEditor) => {
    setEditors((current) => ({ ...current, input1: instance }))
  }, [])
  const mountInput2 = useCallback((instance: editor.IStandaloneCodeEditor) => {
    setEditors((current) => ({ ...current, input2: instance }))
  }, [])
  const mountResult = useCallback((instance: editor.IStandaloneCodeEditor) => {
    const disposeSave = installEditorSaveShortcut(instance.getContainerDomNode(), () => {
      void onSaveRef.current(instance.getValue())
    })
    instance.onDidDispose(disposeSave)
    setEditors((current) => ({ ...current, result: instance }))
  }, [])

  const leaveMergeView = (): void => {
    leftRef.current = true
    setEditorViewMode(file.id, 'edit')
  }

  const revealNextUnhandled = (): void => {
    const cursorLine = editors.result?.getPosition()?.lineNumber ?? 0
    const id = nextUnhandledRangeId(
      controller.layout.resultRanges,
      controller.unhandledIds,
      cursorLine
    )
    const range = id === null ? undefined : session.doc.ranges[id]
    const resultLine = id === null ? undefined : controller.layout.resultRanges[id]?.start
    if (!range || resultLine === undefined) {
      return
    }
    editors.result?.setPosition({ lineNumber: resultLine, column: 1 })
    editors.result?.revealLineInCenter(resultLine)
    editors.input1?.revealLineInCenter(range.input1.start)
    editors.input2?.revealLineInCenter(range.input2.start)
    editors.result?.focus()
  }

  const complete = async (): Promise<void> => {
    setCompleting(true)
    try {
      const context = mergeEditorGitContext(file)
      const outcome = await completeMerge(
        content,
        countUnhandledRanges(controller.settledHandled()),
        {
          confirmWithUnhandled,
          save: (text) => onSaveRef.current(text),
          stage: () => stageRuntimeGitPath(context, file.relativePath),
          refreshStatus: () => refreshMergedFileStatus(context),
          leaveMergeView
        }
      )
      if (outcome.kind === 'stage-failed') {
        console.error('[merge-editor] staging the merged file failed', outcome.error)
        toast.error(
          translate(
            'auto.components.editor.mergeEditor.stageFailed',
            'Saved the merge result, but staging the file failed.'
          )
        )
      }
    } catch (error) {
      console.error('[merge-editor] completing the merge failed', error)
      toast.error(
        translate(
          'auto.components.editor.mergeEditor.completeFailed',
          'Could not complete the merge.'
        )
      )
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MergeEditorHeader
        unhandledCount={controller.unhandledIds.length}
        fromMarkers={session.fromMarkers}
        completing={completing}
        onNextUnhandled={revealNextUnhandled}
        onResetResult={controller.resetResult}
        onShowTextEditor={() => {
          leftRef.current = true
          restoreMarkers()
          leaveMergeView()
        }}
        onComplete={() => void complete()}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 min-w-0 overflow-hidden" style={{ flex: `${ratio} 1 0%` }}>
          <MergeEditorPane
            header={inputPaneTitle(session.inputs[0])}
            value={input1Text}
            language={language}
            readOnly={true}
            ariaLabel={titles[0]}
            onEditorMount={mountInput1}
          />
          <div className="w-px shrink-0 bg-border" />
          <MergeEditorPane
            header={inputPaneTitle(session.inputs[1])}
            value={input2Text}
            language={language}
            readOnly={true}
            ariaLabel={titles[1]}
            onEditorMount={mountInput2}
          />
        </div>
        <ResizeHandle direction="vertical" onResizeStart={() => {}} onRatioChange={setRatio} />
        <div className="flex min-h-0 min-w-0 overflow-hidden" style={{ flex: `${1 - ratio} 1 0%` }}>
          <MergeEditorPane
            header={
              <MergePaneTitle
                title={translate('auto.components.editor.mergeEditor.result', 'Result')}
                mono={file.relativePath}
              />
            }
            value={content}
            language={language}
            readOnly={false}
            ariaLabel={translate('auto.components.editor.mergeEditor.result', 'Result')}
            onEditorMount={mountResult}
            onChange={onContentChange}
          />
        </div>
      </div>
      <MergeCompleteDialogHost state={dialogState} onSettle={settle} />
    </div>
  )
}

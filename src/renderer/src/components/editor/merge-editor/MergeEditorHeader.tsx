import React from 'react'
import { CircleCheck, FileText, GitMerge, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { translate } from '@/i18n/i18n'
import { unhandledCountLabel } from './merge-editor-labels'

export function MergeEditorHeader({
  unhandledCount,
  fromMarkers,
  completing,
  onNextUnhandled,
  onResetResult,
  onShowTextEditor,
  onComplete
}: {
  unhandledCount: number
  fromMarkers?: { hasBase: boolean }
  completing: boolean
  onNextUnhandled: () => void
  onResetResult: () => void
  onShowTextEditor: () => void
  onComplete: () => void
}): React.JSX.Element {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2 text-xs">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={unhandledCount === 0}
        onClick={onNextUnhandled}
      >
        {unhandledCount === 0 ? (
          <CircleCheck className="size-3.5 text-muted-foreground" />
        ) : (
          <TriangleAlert className="size-3.5 text-destructive" />
        )}
        {unhandledCountLabel(unhandledCount)}
      </Button>
      {fromMarkers ? (
        <span className="min-w-0 truncate text-muted-foreground">
          {fromMarkers.hasBase
            ? translate(
                'auto.components.editor.mergeEditor.rebuiltFromMarkers',
                'Rebuilt from conflict markers'
              )
            : translate(
                'auto.components.editor.mergeEditor.noCommonAncestor',
                'No common ancestor (rebuilt from conflict markers)'
              )}
        </span>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="xs" onClick={onResetResult}>
          <RotateCcw className="size-3.5" />
          {translate('auto.components.editor.mergeEditor.resetResult', 'Reset Result')}
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={onShowTextEditor}>
          <FileText className="size-3.5" />
          {translate('auto.components.editor.mergeEditor.showTextEditor', 'Open in Text Editor')}
        </Button>
        <Button type="button" size="xs" disabled={completing} onClick={onComplete}>
          {completing ? <LoadingSpinner className="size-3.5" /> : <GitMerge className="size-3.5" />}
          {translate('auto.components.editor.mergeEditor.completeMerge', 'Complete Merge')}
        </Button>
      </div>
    </div>
  )
}

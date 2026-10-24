import React, { useEffect } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { translate } from '@/i18n/i18n'
import { unavailableMessage } from './merge-editor-labels'
import { MergeEditorWorkspace } from './MergeEditorWorkspace'
import { useMergeEditorSession } from './use-merge-editor-session'
import './merge-editor.css'

export type MergeEditorViewProps = {
  file: OpenFile
  /** The tab's buffer; the merge result is edited in place of it. */
  content: string
  language: string
  onContentChange: (content: string) => void
  onSave: (content: string) => Promise<boolean>
}

/** The three-way merge view of a conflicted file (spec O4): Incoming | Current over Result. */
export default function MergeEditorView(props: MergeEditorViewProps): React.JSX.Element {
  const { file, content, onContentChange } = props
  const load = useMergeEditorSession(file, content, onContentChange)
  const setEditorViewMode = useAppStore((s) => s.setEditorViewMode)
  const unavailableReason = load.status === 'unavailable' ? load.reason : null

  useEffect(() => {
    if (!unavailableReason) {
      return
    }
    toast.info(unavailableMessage(unavailableReason))
    setEditorViewMode(file.id, 'edit')
  }, [file.id, setEditorViewMode, unavailableReason])

  if (load.status !== 'ready') {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {translate('auto.components.editor.mergeEditor.loading', 'Loading merge editor...')}
      </div>
    )
  }
  return <MergeEditorWorkspace {...props} session={load.session} initialHandled={load.handled} />
}

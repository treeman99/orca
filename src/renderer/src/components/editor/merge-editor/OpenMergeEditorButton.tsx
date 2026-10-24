import React from 'react'
import { GitMerge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { isMergeEditorConflict } from '@/store/slices/editor/actions/conflict-file-view-mode'

/** The text editor's way back into the merge view, offered only for two-sided conflicts. */
export function OpenMergeEditorButton({
  file
}: {
  file: Pick<OpenFile, 'id' | 'mode' | 'conflict' | 'readOnly'>
}): React.JSX.Element | null {
  const setEditorViewMode = useAppStore((s) => s.setEditorViewMode)
  if (file.mode !== 'edit' || file.readOnly === true || !isMergeEditorConflict(file.conflict)) {
    return null
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={() => setEditorViewMode(file.id, 'merge')}
    >
      <GitMerge className="size-3.5" />
      {translate('auto.components.editor.mergeEditor.openMergeEditor', 'Open in Merge Editor')}
    </Button>
  )
}

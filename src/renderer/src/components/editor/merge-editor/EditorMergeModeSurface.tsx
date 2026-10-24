import React from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import type { MergeEditorViewProps } from './MergeEditorView'

const MergeEditorView = lazy(() => import('./MergeEditorView'))

/** Whether this edit tab shows the merge view instead of the text editor. */
export function useIsMergeViewMode(file: Pick<OpenFile, 'id' | 'mode'>): boolean {
  return useAppStore((s) => file.mode === 'edit' && s.editorViewMode?.[file.id] === 'merge')
}

/**
 * The 'merge' branch of the edit surface, shaped like the Changes view: the same buffer,
 * content-change and save callbacks, so dirty state, Cmd/Ctrl+S and close prompts carry over.
 */
export function EditorMergeModeSurface({
  externalChangeBanner,
  ...viewProps
}: MergeEditorViewProps & { externalChangeBanner: React.ReactNode }): React.JSX.Element {
  // Why: one merge session per file; another file's view must never inherit this one's state.
  const view = <MergeEditorView key={viewProps.file.id} {...viewProps} />
  if (!externalChangeBanner) {
    return view
  }
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {externalChangeBanner}
      <div className="flex min-h-0 flex-1 flex-col">{view}</div>
    </div>
  )
}

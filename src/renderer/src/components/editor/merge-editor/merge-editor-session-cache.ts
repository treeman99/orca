import { useAppStore } from '@/store'
import type { MergeEditorSession } from './merge-editor-session'
import type { MergeHandledState } from './model/merge-handled-state'

export type CachedMergeSession = { session: MergeEditorSession; handled: MergeHandledState }

// Why: switching tabs unmounts the merge view; keeping the session spares a git read and keeps
// the per-side Ignore marks, which the result text alone cannot reproduce.
const sessionsByFileId = new Map<string, CachedMergeSession>()
let unsubscribe: (() => void) | null = null

// Why: a session only describes the conflict while its tab stays in the merge view.
function dropSessionsOutsideMergeView(): void {
  const { editorViewMode } = useAppStore.getState()
  for (const fileId of sessionsByFileId.keys()) {
    if (editorViewMode[fileId] !== 'merge') {
      sessionsByFileId.delete(fileId)
    }
  }
  if (sessionsByFileId.size === 0) {
    unsubscribe?.()
    unsubscribe = null
  }
}

export function getCachedMergeSession(fileId: string): CachedMergeSession | undefined {
  return sessionsByFileId.get(fileId)
}

export function cacheMergeSession(fileId: string, entry: CachedMergeSession): void {
  sessionsByFileId.set(fileId, entry)
  unsubscribe ??= useAppStore.subscribe(dropSessionsOutsideMergeView)
}

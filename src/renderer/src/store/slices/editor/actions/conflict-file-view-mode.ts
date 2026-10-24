import type { GitConflictKind, GitStatusEntry } from '../../../../../../shared/git-status-types'
import { toOpenConflictMetadata } from '../git/git-status-reconciliation'
import type { EditorDraftState } from './editor-draft-state'
import type { EditorViewMode, OpenFile } from '../types/open-file'

const MERGE_EDITOR_CONFLICT_KINDS: ReadonlySet<GitConflictKind> = new Set([
  'both_modified',
  'both_added'
])

/** Only a live two-sided conflict has the base/ours/theirs index stages the merge view reads. */
export function isMergeEditorConflict(conflict: OpenFile['conflict']): boolean {
  return (
    conflict?.kind === 'conflict-editable' &&
    conflict.conflictStatus === 'unresolved' &&
    MERGE_EDITOR_CONFLICT_KINDS.has(conflict.conflictKind)
  )
}

/** The view mode a conflict open implies; undefined leaves the tab's own choice alone. */
export function viewModeForOpenedConflict(
  conflict: OpenFile['conflict'],
  current: EditorViewMode | undefined
): EditorViewMode | undefined {
  if (isMergeEditorConflict(conflict)) {
    return 'merge'
  }
  // Why: a merge view left from when the file was unresolved must not outlive the conflict.
  return current === 'merge' ? 'edit' : undefined
}

export function applyOpenedConflictViewMode(
  state: Pick<EditorDraftState, 'editorViewMode' | 'setEditorViewMode'>,
  fileId: string,
  entry: GitStatusEntry
): void {
  const next = viewModeForOpenedConflict(
    toOpenConflictMetadata(entry),
    state.editorViewMode[fileId]
  )
  if (next) {
    state.setEditorViewMode(fileId, next)
  }
}

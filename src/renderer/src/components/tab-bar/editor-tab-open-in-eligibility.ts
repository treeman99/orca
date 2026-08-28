import type { OpenFile } from '../../store/slices/editor'

// Why: OpenFile.filePath is not always a file. conflict-review and combined diff
// tabs park the worktree root there, and check-details holds a synthetic tab id —
// launching an external editor on those opens the whole worktree or fails outright.
export function canOpenEditorTabPathInApp(
  file: Pick<OpenFile, 'mode' | 'diffSource' | 'filePath'>
): boolean {
  if (!file.filePath) {
    return false
  }
  if (file.mode === 'edit' || file.mode === 'markdown-preview') {
    return true
  }
  return (
    file.mode === 'diff' &&
    file.diffSource !== 'combined-all' &&
    file.diffSource !== 'combined-uncommitted' &&
    file.diffSource !== 'combined-branch' &&
    file.diffSource !== 'combined-commit'
  )
}

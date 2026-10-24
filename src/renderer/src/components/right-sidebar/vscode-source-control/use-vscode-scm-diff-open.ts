import { useCallback } from 'react'
import { useAppStore } from '@/store'
import { detectLanguage } from '@/lib/language-detect'
import { joinPath } from '@/lib/path'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'
import { openUncommittedEntry } from '../source-control/listing/open-uncommitted-entry'

export type VscodeScmDiffOpeners = {
  openEntryDiff: (entry: GitStatusEntry) => void
  /** A submodule row's `path` is relative to the submodule, so both hops are needed. */
  openSubmoduleEntryDiff: (submodulePath: string, entry: GitStatusEntry) => void
}

export function useVscodeScmDiffOpen(
  worktreeId: string | null,
  worktreePath: string | null
): VscodeScmDiffOpeners {
  const openDiff = useAppStore((s) => s.openDiff)

  const open = useCallback(
    (relativePath: string, entry: GitStatusEntry): void => {
      if (!worktreeId || !worktreePath) {
        return
      }
      openDiff(
        worktreeId,
        joinPath(worktreePath, relativePath),
        relativePath,
        detectLanguage(entry.path),
        entry.area === 'staged'
      )
    },
    [openDiff, worktreeId, worktreePath]
  )

  // Why: like VS Code, a merge-conflict row opens the working file — through the conflict-safe
  // entry point the Source Control list uses, which shows the merge view for two-sided conflicts.
  const openConflict = useCallback(
    (entry: GitStatusEntry): void => {
      if (worktreeId && worktreePath) {
        openUncommittedEntry(useAppStore.getState(), worktreeId, worktreePath, entry)
      }
    },
    [worktreeId, worktreePath]
  )

  return {
    openEntryDiff: useCallback(
      (entry) =>
        entry.conflictKind && entry.conflictStatus ? openConflict(entry) : open(entry.path, entry),
      [open, openConflict]
    ),
    openSubmoduleEntryDiff: useCallback(
      (submodulePath, entry) => open(joinPath(submodulePath, entry.path), entry),
      [open]
    )
  }
}

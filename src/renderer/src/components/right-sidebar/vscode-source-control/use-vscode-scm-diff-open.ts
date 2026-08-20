import { useCallback } from 'react'
import { useAppStore } from '@/store'
import { detectLanguage } from '@/lib/language-detect'
import { joinPath } from '@/lib/path'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'

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

  return {
    openEntryDiff: useCallback((entry) => open(entry.path, entry), [open]),
    openSubmoduleEntryDiff: useCallback(
      (submodulePath, entry) => open(joinPath(submodulePath, entry.path), entry),
      [open]
    )
  }
}

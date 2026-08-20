import { useCallback, useState } from 'react'
import { getConnectionId } from '@/lib/connection-context'
import { restoreRuntimeGitSubmodulePointer } from '@/runtime/runtime-git-client'
import type { VscodeScmContext } from './use-vscode-scm-context'

export type VscodeScmPointerRestore = {
  busy: boolean
  error: string | null
  clearError: () => void
  restore: (submodulePath: string) => Promise<void>
}

/**
 * `git submodule update --init` for a gitlink row in the PARENT section.
 *
 * Discarding a gitlink is not a file restore. `git restore` lies about this row — on a
 * moved or dirty pointer it exits 0 having changed nothing, and on a deleted submodule
 * directory it clears the row while leaving an empty, uninitialized folder behind. Only
 * `submodule update --init` actually puts the recorded commit back, and it leaves the
 * submodule on a detached HEAD, which the confirmation dialog states before we get here.
 */
export function useVscodeScmPointerRestore(scm: VscodeScmContext): VscodeScmPointerRestore {
  const { repoSettings, worktreeId, worktreePath } = scm
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return {
    busy,
    error,
    clearError: useCallback(() => setError(null), []),
    restore: useCallback(
      async (submodulePath: string): Promise<void> => {
        if (!worktreeId || !worktreePath) {
          return
        }
        setBusy(true)
        setError(null)
        try {
          await restoreRuntimeGitSubmodulePointer(
            {
              settings: repoSettings,
              worktreeId,
              worktreePath,
              connectionId: getConnectionId(worktreeId) ?? undefined
            },
            submodulePath
          )
        } catch (caught) {
          // Why surfaced: an older relay, an uninitialized submodule, and the
          // not-a-repository-root guard all land here, and a silent catch makes every one
          // of them look like a button that simply does nothing.
          setError(caught instanceof Error ? caught.message : String(caught))
        } finally {
          setBusy(false)
          await scm.refresh()
        }
      },
      [repoSettings, scm, worktreeId, worktreePath]
    )
  }
}

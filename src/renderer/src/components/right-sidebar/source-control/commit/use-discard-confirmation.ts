import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { getConnectionId } from '@/lib/connection-context'
import { bulkUnstageRuntimeGitPaths, type RuntimeGitContext } from '@/runtime/runtime-git-client'
import { translate } from '@/i18n/i18n'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import {
  getDiscardAllPaths,
  runDiscardAllForArea,
  type DiscardAllArea
} from './discard-all-sequence'
import type { PendingDiscardConfirmation } from './discard-dialog'
import { discardSourceControlEntry } from './discard-entry'
import type { SourceControlEntryGroups } from '../listing/section-order'

export function useSourceControlDiscardConfirmation({
  activeRepoSettings,
  activeWorktreeId,
  worktreePath,
  grouped,
  isExecutingBulk,
  setIsExecutingBulk,
  clearSelection,
  discardMany,
  discardSingle,
  refreshSubmodule,
  refreshActiveGitStatusAfterMutation
}: {
  activeRepoSettings: RuntimeGitContext['settings']
  activeWorktreeId: string | null
  worktreePath: string | null
  grouped: SourceControlEntryGroups
  isExecutingBulk: boolean
  setIsExecutingBulk: (value: boolean) => void
  clearSelection: () => void
  discardMany: (paths: string[]) => Promise<void>
  discardSingle: (path: string) => Promise<void>
  refreshSubmodule: (submodulePath: string) => void
  refreshActiveGitStatusAfterMutation: () => Promise<void>
}) {
  const [pendingDiscard, setPendingDiscard] = useState<PendingDiscardConfirmation | null>(null)
  // Why: reset during render so a worktree switch never paints the previous confirmation.
  const [pendingDiscardWorktreeId, setPendingDiscardWorktreeId] = useState(activeWorktreeId)
  if (pendingDiscardWorktreeId !== activeWorktreeId) {
    setPendingDiscardWorktreeId(activeWorktreeId)
    setPendingDiscard(null)
  }

  const handleDiscard = useCallback(
    async (entry: GitStatusEntry) => {
      try {
        await discardSourceControlEntry({
          entry,
          activeRepoSettings,
          activeWorktreeId,
          worktreePath,
          discardSingle,
          refreshSubmodule
        })
        await refreshActiveGitStatusAfterMutation()
      } catch (error) {
        // Why surfaced rather than swallowed: an older SSH relay, an uninitialized submodule,
        // and the not-a-repository-root guard all land here, and a silent catch made every one
        // of them look like a button that simply does nothing.
        console.error('[SourceControl] discard failure', error)
        toast.error(
          translate('sourceControl.discardFailed', 'Could not discard {{path}}: {{message}}', {
            path: entry.path,
            message: error instanceof Error ? error.message : String(error)
          })
        )
      }
    },
    [
      activeRepoSettings,
      activeWorktreeId,
      discardSingle,
      refreshActiveGitStatusAfterMutation,
      refreshSubmodule,
      worktreePath
    ]
  )

  // Why: "Discard all" skips unresolved/resolved_locally rows (discarding can re-create the conflict or lose the resolution; no v1 UX for it).
  // Why: sequencing/filter rules live in discard-all-sequence.ts for independent unit tests, with per-file fallback when an older SSH relay lacks bulk discard.
  const handleRevertAllInArea = useCallback(
    async (area: DiscardAllArea, confirmedPaths?: readonly string[]) => {
      if (!worktreePath || !activeWorktreeId || isExecutingBulk) {
        return
      }
      const paths = confirmedPaths ? [...confirmedPaths] : getDiscardAllPaths(grouped[area], area)
      if (paths.length === 0) {
        return
      }
      setIsExecutingBulk(true)
      try {
        const connectionId = getConnectionId(activeWorktreeId) ?? undefined
        // Why: onError fires per failure; aggregate into one toast so a partial failure across N files doesn't spam N toasts.
        const errors: unknown[] = []
        const result = await runDiscardAllForArea(area, paths, {
          bulkUnstage: (filePaths) =>
            bulkUnstageRuntimeGitPaths(
              {
                // Why: route unstaging by the repo OWNER host, not the focused runtime.
                settings: activeRepoSettings,
                worktreeId: activeWorktreeId,
                worktreePath,
                connectionId
              },
              filePaths
            ),
          discardMany,
          discardOne: discardSingle,
          onError: (error) => {
            errors.push(error)
            console.error('[SourceControl] discard-all failure', error)
          }
        })
        if (result.aborted) {
          toast.error(
            translate(
              'auto.components.right.sidebar.SourceControl.a5e5a11090',
              'Discard all failed — unable to unstage files before discard'
            ),
            { description: errors[0] instanceof Error ? errors[0].message : undefined }
          )
        } else if (result.failed.length > 0) {
          // Why: show only the first error + a sample of failed paths to avoid a huge toast body on bulk failures.
          const firstMsg = errors[0] instanceof Error ? errors[0].message : undefined
          const sample = result.failed.slice(0, 3).join(', ')
          const more = result.failed.length > 3 ? `, +${result.failed.length - 3} more` : ''
          toast.error(
            translate(
              'auto.components.right.sidebar.SourceControl.8eb3782a0c',
              'Failed to discard {{value0}} file{{value1}}',
              { value0: result.failed.length, value1: result.failed.length === 1 ? '' : 's' }
            ),
            {
              description: firstMsg
                ? translate(
                    'auto.components.right.sidebar.SourceControl.dc5a6465fc',
                    '{{value0}} (e.g. {{value1}}{{value2}})',
                    { value0: firstMsg, value1: sample, value2: more }
                  )
                : `${sample}${more}`
            }
          )
        }
        if (!result.aborted) {
          await refreshActiveGitStatusAfterMutation()
          clearSelection()
        }
      } finally {
        setIsExecutingBulk(false)
      }
    },
    [
      activeRepoSettings,
      worktreePath,
      activeWorktreeId,
      grouped,
      isExecutingBulk,
      clearSelection,
      discardMany,
      discardSingle,
      refreshActiveGitStatusAfterMutation,
      setIsExecutingBulk
    ]
  )

  const requestDiscardAllInArea = useCallback(
    (area: DiscardAllArea, confirmedPaths?: readonly string[]): void => {
      if (!worktreePath || !activeWorktreeId || isExecutingBulk) {
        return
      }
      const paths = confirmedPaths ? [...confirmedPaths] : getDiscardAllPaths(grouped[area], area)
      if (paths.length === 0) {
        return
      }
      setPendingDiscard({ kind: 'area', area, paths })
    },
    [activeWorktreeId, grouped, isExecutingBulk, worktreePath]
  )
  const requestDiscardEntry = useCallback(
    (entry: GitStatusEntry): void => {
      if (!worktreePath || !activeWorktreeId || isExecutingBulk) {
        return
      }
      setPendingDiscard({ kind: 'entry', entry })
    },
    [activeWorktreeId, isExecutingBulk, worktreePath]
  )
  const requestDiscardPaths = useCallback(
    (area: DiscardAllArea, paths: readonly string[]): void => {
      // Why: same gate as the other request handlers — handleRevertAllInArea rejects these states silently, so the dialog would confirm into a no-op.
      if (!worktreePath || !activeWorktreeId || isExecutingBulk || paths.length === 0) {
        return
      }
      setPendingDiscard({ kind: 'area', area, paths: [...paths] })
    },
    [activeWorktreeId, isExecutingBulk, worktreePath]
  )
  const cancelPendingDiscard = useCallback(() => setPendingDiscard(null), [])
  const confirmPendingDiscard = useCallback((): void => {
    const pending = pendingDiscard
    if (!pending) {
      return
    }
    setPendingDiscard(null)
    if (pending.kind === 'entry') {
      void handleDiscard(pending.entry)
      return
    }
    void handleRevertAllInArea(pending.area, pending.paths)
  }, [handleDiscard, handleRevertAllInArea, pendingDiscard])

  return {
    pendingDiscard,
    requestDiscardAllInArea,
    requestDiscardEntry,
    requestDiscardPaths,
    cancelPendingDiscard,
    confirmPendingDiscard
  }
}

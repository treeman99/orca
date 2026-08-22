import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import { getConnectionId } from '@/lib/connection-context'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { getRuntimeGitSubmoduleStatus, type RuntimeGitContext } from '@/runtime/runtime-git-client'
import {
  getSubmoduleExpansionKey,
  isExpandableSubmoduleEntry,
  parseSubmoduleExpansionKey,
  type SubmoduleStatusState
} from './submodule-expansion'

export type UseSourceControlSubmoduleStatusInput = {
  activeWorktreeId: string | null | undefined
  worktreePath: string | null
  activeRepoSettings: RuntimeGitContext['settings']
  // Why: re-fetch expanded children whenever the parent status poll refreshes
  // its entries, so an expanded submodule's inner changes stay fresh.
  entries: readonly GitStatusEntry[]
}

// Why: sits above the 3s floor that keeps evidence-driven status refreshes from
// running git back-to-back, and only ever applies to submodules the user has
// explicitly expanded.
const EXPANDED_SUBMODULE_REFRESH_INTERVAL_MS = 4000

export type UseSourceControlSubmoduleStatusResult = {
  expandedSubmoduleKeys: Set<string>
  submoduleStatusByKey: Record<string, SubmoduleStatusState>
  toggleSubmodule: (entry: Pick<GitStatusEntry, 'area' | 'path'>) => void
  /** Re-read one expanded submodule immediately, keyed by its path. */
  refreshSubmodule: (submodulePath: string) => void
}

/**
 * Owns the lazy submodule-expansion state for Source Control: which dirty
 * submodules are expanded and the on-demand inner status for each. Dirty
 * submodules start collapsed and only query their inner `git status` when
 * expanded, so the parent status poll never recurses into (possibly nested)
 * submodules.
 */
export function useSourceControlSubmoduleStatus(
  input: UseSourceControlSubmoduleStatusInput
): UseSourceControlSubmoduleStatusResult {
  const { activeWorktreeId, worktreePath, activeRepoSettings, entries } = input
  const [expandedSubmoduleKeys, setExpandedSubmoduleKeys] = useState<Set<string>>(() => new Set())
  const activeRuntimeRouteKey = activeRepoSettings?.activeRuntimeEnvironmentId?.trim() ?? ''
  const activeConnectionRouteKey = getConnectionId(activeWorktreeId ?? null) ?? ''
  const submoduleStatusScopeKey = `${activeConnectionRouteKey}\0${activeRuntimeRouteKey}\0${activeWorktreeId ?? ''}\0${worktreePath ?? ''}`
  // Why: the parent poll and the expanded-submodule tick are independent clocks, so without this
  // a slow inner `git status` gets a second (and third) spawn queued behind it. That is the
  // pile-up a repo with many expanded submodules would feel first.
  const inFlightKeysRef = useRef<Set<string>>(new Set())
  // Why: scope lives in the status store so a late response from a previous
  // worktree/host can no-op in the updater instead of mutating a render-time ref.
  const [submoduleStatusStore, setSubmoduleStatusStore] = useState<{
    scope: string
    byKey: Record<string, SubmoduleStatusState>
  }>(() => ({ scope: submoduleStatusScopeKey, byKey: {} }))
  // Why: reset during render so a worktree/host switch never paints the previous expansion.
  if (submoduleStatusStore.scope !== submoduleStatusScopeKey) {
    setSubmoduleStatusStore({ scope: submoduleStatusScopeKey, byKey: {} })
    inFlightKeysRef.current.clear()
    setExpandedSubmoduleKeys(new Set())
  }
  const submoduleStatusByKey = submoduleStatusStore.byKey

  const fetchSubmoduleStatus = useCallback(
    async (expansionKey: string): Promise<void> => {
      if (!worktreePath) {
        return
      }
      const parsed = parseSubmoduleExpansionKey(expansionKey)
      if (!parsed) {
        return
      }
      if (inFlightKeysRef.current.has(expansionKey)) {
        return
      }
      const { area, path: submodulePath } = parsed
      const scopeAtStart = submoduleStatusScopeKey
      inFlightKeysRef.current.add(expansionKey)
      // Why: keep any already-loaded children visible during a poll-driven
      // refetch so expanding then refreshing doesn't flash a loading row.
      setSubmoduleStatusStore((prev) =>
        prev.scope !== scopeAtStart || prev.byKey[expansionKey]
          ? prev
          : {
              ...prev,
              byKey: { ...prev.byKey, [expansionKey]: { status: 'loading' } }
            }
      )
      try {
        const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
        const result = await getRuntimeGitSubmoduleStatus(
          {
            // Why: route by the repo OWNER host, matching the rest of this panel.
            settings: activeRepoSettings,
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId
          },
          submodulePath,
          area
        )
        setSubmoduleStatusStore((prev) =>
          prev.scope !== scopeAtStart
            ? prev
            : {
                ...prev,
                byKey: {
                  ...prev.byKey,
                  [expansionKey]: {
                    status: 'loaded',
                    entries: result.entries,
                    ...(result.didHitLimit ? { didHitLimit: true } : {}),
                    // Why: the inner status already carries the submodule's own branch/HEAD.
                    // Keeping them costs no extra git call and is what lets the panel show the
                    // submodule as a separate repository on its own branch.
                    ...(result.branch ? { branch: result.branch } : {}),
                    ...(result.head ? { head: result.head } : {})
                  }
                }
              }
        )
      } catch (error) {
        setSubmoduleStatusStore((prev) =>
          prev.scope !== scopeAtStart
            ? prev
            : {
                ...prev,
                byKey: {
                  ...prev.byKey,
                  [expansionKey]: {
                    status: 'error',
                    error: error instanceof Error ? error.message : String(error)
                  }
                }
              }
        )
      } finally {
        inFlightKeysRef.current.delete(expansionKey)
      }
    },
    [activeRepoSettings, activeWorktreeId, submoduleStatusScopeKey, worktreePath]
  )

  const toggleSubmodule = useCallback((entry: Pick<GitStatusEntry, 'area' | 'path'>) => {
    const expansionKey = getSubmoduleExpansionKey(entry)
    setExpandedSubmoduleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(expansionKey)) {
        next.delete(expansionKey)
      } else {
        next.add(expansionKey)
      }
      return next
    })
  }, [])

  // Why a ref: the interval below must call the latest refresh without listing
  // `entries` as a dependency, which would tear down and reinstall the timer on
  // every parent status poll.
  const refreshExpandedRef = useRef<() => void>(() => {})
  refreshExpandedRef.current = () => {
    const visibleExpandableKeys = new Set(
      entries.filter(isExpandableSubmoduleEntry).map(getSubmoduleExpansionKey)
    )
    for (const expansionKey of expandedSubmoduleKeys) {
      if (visibleExpandableKeys.has(expansionKey)) {
        void fetchSubmoduleStatus(expansionKey)
      }
    }
  }

  // Why: (re)load inner status only for currently-expanded submodules, on expand
  // and whenever the parent poll hands back changed entries. Collapsed submodules
  // never trigger any extra git work.
  useEffect(() => {
    refreshExpandedRef.current()
  }, [expandedSubmoduleKeys, entries, fetchSubmoduleStatus])

  // Why: `entries` alone cannot keep an expanded submodule fresh. Editing inside
  // an already-dirty submodule leaves the parent's gitlink row byte-identical
  // (the `S.MU` flags and both gitlink OIDs are unchanged), so the status slice
  // keeps the previous array reference and the inner file list would stay frozen
  // at the moment of expansion. Tick those submodules on their own clock instead.
  //
  // Keyed on the boolean, not the Set: re-running per toggle would reinstall the
  // interval and fire its immediate run, double-spawning git on every expand.
  const hasExpandedSubmodules = expandedSubmoduleKeys.size > 0
  useEffect(() => {
    if (!hasExpandedSubmodules) {
      return
    }
    // Why: the install-time run duplicates the expand-driven fetch above. Later
    // runs are the window becoming visible again, which is worth refreshing for.
    let skipImmediateRun = true
    return installWindowVisibilityInterval({
      run: () => refreshExpandedRef.current(),
      runOnVisible: () => {
        if (skipImmediateRun) {
          skipImmediateRun = false
          return
        }
        refreshExpandedRef.current()
      },
      intervalMs: EXPANDED_SUBMODULE_REFRESH_INTERVAL_MS
    })
  }, [hasExpandedSubmodules])

  /**
   * Re-read one submodule right now, by PATH rather than by expansion key.
   *
   * Why by path: a child row carries the submodule's own area, so a discard of an untracked
   * file inside `vendor/sub` reports `untracked` while the expansion key is keyed on the
   * PARENT gitlink's area (`unstaged::vendor/sub`). Matching on area would miss it entirely
   * and the row would sit there, already gone from disk, until the 4s tick.
   */
  const refreshSubmodule = useCallback(
    (submodulePath: string) => {
      for (const expansionKey of expandedSubmoduleKeys) {
        if (parseSubmoduleExpansionKey(expansionKey)?.path === submodulePath) {
          void fetchSubmoduleStatus(expansionKey)
        }
      }
    },
    [expandedSubmoduleKeys, fetchSubmoduleStatus]
  )

  return { expandedSubmoduleKeys, submoduleStatusByKey, toggleSubmodule, refreshSubmodule }
}

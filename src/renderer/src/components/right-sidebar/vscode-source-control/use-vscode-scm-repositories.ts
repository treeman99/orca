import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getConnectionId } from '@/lib/connection-context'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { getRuntimeGitSubmoduleStatus } from '@/runtime/runtime-git-client'
import type { VscodeScmContext } from './use-vscode-scm-context'
import {
  useVscodeScmSubmoduleList,
  type VscodeScmSubmoduleList
} from './use-vscode-scm-submodule-list'
import { isUninitializedSubmoduleError } from './vscode-scm-submodule-availability'
import {
  buildVscodeScmParentRepository,
  buildVscodeScmSubmoduleRepositories,
  type VscodeScmRepository,
  type VscodeScmSubmoduleStatusState
} from './vscode-scm-repository'

// Why a separate clock: the parent poll cannot see edits inside an already-dirty
// submodule — the gitlink row stays byte-identical, so the status slice keeps the
// same array reference and a child list would freeze at first load.
const SUBMODULE_REFRESH_INTERVAL_MS = 4000

export type VscodeScmRepositoryList = {
  repositories: VscodeScmRepository[]
  /** Re-read one submodule's status, e.g. straight after a write to it. */
  refreshSubmodule: (submodulePath: string) => void
  submoduleList: VscodeScmSubmoduleList
}

/**
 * Assembles the panel's repository list: the parent worktree first, then one
 * section per initialized submodule, each carrying that submodule's OWN `git status`.
 */
export function useVscodeScmRepositories(scm: VscodeScmContext): VscodeScmRepositoryList {
  const { entries, repoSettings, worktreeId, worktreePath } = scm
  const [statusByPath, setStatusByPath] = useState<Record<string, VscodeScmSubmoduleStatusState>>(
    {}
  )

  const submoduleList = useVscodeScmSubmoduleList(scm)
  const submodulePaths = submoduleList.paths
  // Why a string key: the array identity changes on every status poll, which would
  // reinstall the refresh interval (and fire its immediate run) each time.
  const submodulePathKey = submodulePaths.join('\n')

  const runtimeRouteKey = repoSettings?.activeRuntimeEnvironmentId?.trim() ?? ''
  const connectionRouteKey = getConnectionId(worktreeId ?? null) ?? ''

  // Why: a monotonic generation drops in-flight responses when the worktree,
  // path, runtime, or SSH route changes, so a slow reply from the previous target
  // can never write another repository's status into this panel.
  const generationRef = useRef(0)
  // Why: the parent poll and this timer are independent clocks, so without an
  // in-flight guard a slow inner `git status` gets a second spawn queued behind it.
  const inFlightRef = useRef<Set<string>>(new Set())
  // Why: a refresh requested DURING an in-flight read cannot just be dropped — after a
  // write, that in-flight read started before the write and would restore a stale section.
  const pendingRefetchRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    generationRef.current += 1
    inFlightRef.current.clear()
    pendingRefetchRef.current.clear()
    setStatusByPath({})
  }, [connectionRouteKey, runtimeRouteKey, worktreeId, worktreePath])

  const fetchSubmoduleStatus = useCallback(
    async (submodulePath: string): Promise<void> => {
      if (!worktreePath) {
        return
      }
      if (inFlightRef.current.has(submodulePath)) {
        pendingRefetchRef.current.add(submodulePath)
        return
      }
      const generation = generationRef.current
      inFlightRef.current.add(submodulePath)
      // Why: keep an already-loaded section on screen through a refetch so the
      // 4s tick never flashes its rows back to a loading placeholder.
      setStatusByPath((prev) =>
        prev[submodulePath] ? prev : { ...prev, [submodulePath]: { status: 'loading' } }
      )
      try {
        const result = await getRuntimeGitSubmoduleStatus(
          {
            // Why: route by the repo OWNER host, matching the rest of this panel.
            settings: repoSettings,
            worktreeId,
            worktreePath,
            connectionId: getConnectionId(worktreeId ?? null) ?? undefined
          },
          submodulePath
        )
        if (generationRef.current !== generation) {
          return
        }
        setStatusByPath((prev) => ({
          ...prev,
          [submodulePath]: {
            status: 'loaded',
            entries: result.entries,
            ...(result.branch ? { branch: result.branch } : {}),
            ...(result.head ? { head: result.head } : {}),
            ...(result.upstreamStatus ? { upstreamStatus: result.upstreamStatus } : {}),
            ...(result.conflictOperation ? { conflictOperation: result.conflictOperation } : {}),
            ...(result.didHitLimit ? { didHitLimit: true } : {})
          }
        }))
      } catch (error) {
        if (generationRef.current !== generation) {
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        setStatusByPath((prev) => ({
          ...prev,
          [submodulePath]: {
            status: 'error',
            error: message,
            uninitialized: isUninitializedSubmoduleError(message)
          }
        }))
      } finally {
        inFlightRef.current.delete(submodulePath)
        if (pendingRefetchRef.current.delete(submodulePath)) {
          void fetchSubmoduleStatusRef.current(submodulePath)
        }
      }
    },
    [repoSettings, worktreeId, worktreePath]
  )
  // Why a ref: the finally block above re-enters this same callback, which cannot
  // reference itself before its own definition completes.
  const fetchSubmoduleStatusRef = useRef(fetchSubmoduleStatus)
  fetchSubmoduleStatusRef.current = fetchSubmoduleStatus

  // Why a ref: the interval must reach the newest fetch without listing `entries`
  // as a dependency, which would tear the timer down on every parent status poll.
  const refreshAllRef = useRef<() => void>(() => {})
  refreshAllRef.current = () => {
    for (const submodulePath of submodulePaths) {
      void fetchSubmoduleStatus(submodulePath)
    }
  }

  useEffect(() => {
    refreshAllRef.current()
  }, [submodulePathKey, entries, fetchSubmoduleStatus])

  useEffect(() => {
    if (!submodulePathKey) {
      return
    }
    // Why: the install-time run duplicates the effect above; later visible runs are
    // the window coming back, which is worth a refresh.
    let skipImmediateRun = true
    return installWindowVisibilityInterval({
      run: () => refreshAllRef.current(),
      runOnVisible: () => {
        if (skipImmediateRun) {
          skipImmediateRun = false
          return
        }
        refreshAllRef.current()
      },
      intervalMs: SUBMODULE_REFRESH_INTERVAL_MS
    })
  }, [submodulePathKey])

  const repositories = useMemo(
    () => [
      buildVscodeScmParentRepository({
        worktreePath,
        branch: scm.branch,
        entries,
        upstreamStatus: scm.upstreamStatus,
        conflictOperation: scm.conflictOperation,
        truncated: scm.repositoryHuge,
        detectionTruncated: submoduleList.didHitLimit
      }),
      ...buildVscodeScmSubmoduleRepositories({
        submodulePaths,
        statusByPath,
        parentBranch: scm.branch
      })
    ],
    [
      entries,
      scm.branch,
      scm.conflictOperation,
      scm.repositoryHuge,
      scm.upstreamStatus,
      statusByPath,
      submoduleList.didHitLimit,
      submodulePaths,
      worktreePath
    ]
  )

  return {
    repositories,
    refreshSubmodule: useCallback(
      (submodulePath: string) => void fetchSubmoduleStatus(submodulePath),
      [fetchSubmoduleStatus]
    ),
    submoduleList
  }
}

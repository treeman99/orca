import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getConnectionId } from '@/lib/connection-context'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { listRuntimeGitSubmodules } from '@/runtime/runtime-git-client'
import type { VscodeScmContext } from './use-vscode-scm-context'
import { collectDirtySubmodulePaths, selectDetectedSubmodulePaths } from './vscode-scm-repository'

/**
 * Safety net only. `.gitmodules` normally changes together with the parent's status
 * (adding a submodule dirties it), and that is what drives the refetch below — so an
 * idle repository costs no extra git call. This catches an edit made outside Orca.
 */
const SUBMODULE_LIST_INTERVAL_MS = 30_000

const EMPTY_PATHS: readonly string[] = []

export type VscodeScmSubmoduleList = {
  /** Initialized submodules, parent-relative and sorted. */
  paths: readonly string[]
  /** `.gitmodules` holds more submodules than the detection cap; the list is partial. */
  didHitLimit: boolean
  /** False when the paired host predates the submodule write RPCs. */
  writeSupported: boolean
  refresh: () => void
}

/**
 * Every submodule `.gitmodules` declares, not just the ones the parent's status flagged
 * as dirty — VS Code's `git.detectSubmodules` opens a clean submodule as a repository too,
 * which is the only way its branch is ever on screen.
 *
 * Uninitialized entries are dropped here rather than rendered as failed sections: a
 * submodule with no checkout has no status to read, and a freshly cloned repository would
 * otherwise open full of error banners.
 */
export function useVscodeScmSubmoduleList(scm: VscodeScmContext): VscodeScmSubmoduleList {
  const { entries, ready, repoSettings, worktreeId, worktreePath } = scm
  const [state, setState] = useState<{
    paths: readonly string[]
    didHitLimit: boolean
    writeSupported: boolean
  }>({ paths: EMPTY_PATHS, didHitLimit: false, writeSupported: true })
  // Why derived here and not left empty: an old host answers `git.submoduleList` with
  // method-not-found, and dropping every section would read as "no submodules" rather than
  // "this host is behind". The parent's own status still names the dirty ones.
  const fallbackPaths = useMemo(
    () => (state.writeSupported ? EMPTY_PATHS : collectDirtySubmodulePaths(entries)),
    [entries, state.writeSupported]
  )

  const runtimeRouteKey = repoSettings?.activeRuntimeEnvironmentId?.trim() ?? ''
  const connectionRouteKey = getConnectionId(worktreeId ?? null) ?? ''

  // Why a generation: a slow reply from a previous worktree or SSH route must never
  // write another repository's submodule list into this panel.
  const generationRef = useRef(0)
  const inFlightRef = useRef(false)
  // Why a ref: the fallback needs the newest parent rows, but listing `entries` as a
  // dependency of the fetch callback would restart the poll on every parent status tick.
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  useEffect(() => {
    generationRef.current += 1
    inFlightRef.current = false
    setState({ paths: EMPTY_PATHS, didHitLimit: false, writeSupported: true })
  }, [connectionRouteKey, runtimeRouteKey, worktreeId, worktreePath])

  const fetchList = useCallback(async (): Promise<void> => {
    if (!ready || !worktreePath || inFlightRef.current) {
      return
    }
    const generation = generationRef.current
    inFlightRef.current = true
    try {
      const result = await listRuntimeGitSubmodules({
        // Why: route by the repo OWNER host, matching the rest of this panel.
        settings: repoSettings,
        worktreeId,
        worktreePath,
        connectionId: getConnectionId(worktreeId ?? null) ?? undefined
      })
      if (generationRef.current !== generation) {
        return
      }
      const paths =
        result.unsupported === true
          ? collectDirtySubmodulePaths(entriesRef.current)
          : selectDetectedSubmodulePaths(result.submodules)
      setState((prev) =>
        // Why compare: a new array identity on every poll would reinstall the per-submodule
        // status timers below it, and each reinstall fires an immediate status read.
        prev.didHitLimit === result.didHitLimit &&
        prev.writeSupported === (result.unsupported !== true) &&
        prev.paths.length === paths.length &&
        paths.every((path, index) => prev.paths[index] === path)
          ? prev
          : {
              paths,
              didHitLimit: result.didHitLimit,
              writeSupported: result.unsupported !== true
            }
      )
    } catch {
      // Why swallow: a submodule-list failure must not blank the parent section, which is
      // the part the user is almost always looking at. The next poll retries.
    } finally {
      inFlightRef.current = false
    }
  }, [ready, repoSettings, worktreeId, worktreePath])

  // Why a ref: the interval must reach the newest fetch without listing `entries` as a
  // dependency, which would tear the timer down on every parent status poll.
  const fetchRef = useRef<() => void>(() => {})
  fetchRef.current = () => void fetchList()

  useEffect(() => {
    fetchRef.current()
  }, [entries, fetchList])

  useEffect(() => {
    if (!ready) {
      return
    }
    let skipImmediateRun = true
    return installWindowVisibilityInterval({
      run: () => fetchRef.current(),
      runOnVisible: () => {
        if (skipImmediateRun) {
          skipImmediateRun = false
          return
        }
        fetchRef.current()
      },
      intervalMs: SUBMODULE_LIST_INTERVAL_MS
    })
  }, [ready])

  return {
    paths: state.writeSupported ? state.paths : fallbackPaths,
    didHitLimit: state.didHitLimit,
    writeSupported: state.writeSupported,
    refresh: useCallback(() => void fetchList(), [fetchList])
  }
}

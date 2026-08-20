import { useCallback, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { getConnectionId } from '@/lib/connection-context'
import { getRepoOwnerRoutedSettings } from '@/lib/repo-runtime-owner'
import {
  bulkStageRuntimeGitPaths,
  bulkUnstageRuntimeGitPaths,
  commitRuntimeGit,
  discardRuntimeGitPath,
  stageRuntimeGitPath,
  unstageRuntimeGitPath,
  type RuntimeGitContext
} from '@/runtime/runtime-git-client'
import { useVscodeScmDiffOpen } from './use-vscode-scm-diff-open'
import { refreshGitStatusForWorktree } from '../git-status-refresh'
import { isFolderRepo } from '../../../../../shared/repo-kind'
import type {
  GitConflictOperation,
  GitStatusEntry,
  GitUpstreamStatus
} from '../../../../../shared/git-status-types'

// Why module-level: an inline `?? []` literal is a fresh reference on every
// store write, which re-renders the whole panel on unrelated state changes.
const EMPTY_ENTRIES: GitStatusEntry[] = []

export type VscodeScmContext = {
  ready: boolean
  worktreeId: string | null
  worktreePath: string | null
  /** Repo OWNER-routed settings, so submodule status reads reach the right host. */
  repoSettings: RuntimeGitContext['settings']
  entries: GitStatusEntry[]
  branch: string | null
  upstreamStatus: GitUpstreamStatus | null
  conflictOperation: GitConflictOperation | null
  repositoryHuge: boolean
  busy: boolean
  lastError: string | null
  clearError: () => void
  refresh: () => Promise<void>
  stage: (paths: string[]) => Promise<void>
  unstage: (paths: string[]) => Promise<void>
  discard: (paths: string[]) => Promise<void>
  commit: (message: string, options?: { stageAllFirst?: boolean }) => Promise<boolean>
  publish: () => Promise<void>
  sync: () => Promise<void>
  openEntryDiff: (entry: GitStatusEntry) => void
  openSubmoduleEntryDiff: (submodulePath: string, entry: GitStatusEntry) => void
}

function shortBranchName(branch: string | null | undefined): string | null {
  if (!branch) {
    return null
  }
  return branch.startsWith('refs/heads/') ? branch.slice('refs/heads/'.length) : branch
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * Everything the VS Code-shaped panel needs, resolved once. Git mutations route
 * by the repo OWNER host rather than the focused runtime, matching the existing
 * Source Control panel — otherwise an SSH worktree stages against the wrong host.
 */
export function useVscodeScmContext(): VscodeScmContext {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const settings = useAppStore((s) => s.settings)
  const setGitStatus = useAppStore((s) => s.setGitStatus)
  const setUpstreamStatus = useAppStore((s) => s.setUpstreamStatus)
  const fetchUpstreamStatus = useAppStore((s) => s.fetchUpstreamStatus)
  const updateWorktreeGitIdentity = useAppStore((s) => s.updateWorktreeGitIdentity)
  const pushBranch = useAppStore((s) => s.pushBranch)
  const syncBranch = useAppStore((s) => s.syncBranch)
  const entries = useAppStore((s) =>
    activeWorktreeId ? (s.gitStatusByWorktree[activeWorktreeId] ?? EMPTY_ENTRIES) : EMPTY_ENTRIES
  )
  const upstreamStatus = useAppStore((s) =>
    activeWorktreeId ? (s.remoteStatusesByWorktree[activeWorktreeId] ?? null) : null
  )
  const conflictOperation = useAppStore((s) =>
    activeWorktreeId ? (s.gitConflictOperationByWorktree[activeWorktreeId] ?? null) : null
  )
  const repositoryHuge = useAppStore((s) =>
    activeWorktreeId ? Boolean(s.gitStatusHugeByWorktree[activeWorktreeId]) : false
  )

  const [busy, setBusy] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const worktreePath = activeWorktree?.path ?? null
  const isFolder = activeRepo ? isFolderRepo(activeRepo) : false
  const repoSettings = useMemo(
    () =>
      getRepoOwnerRoutedSettings(
        settings,
        activeRepo
          ? {
              id: activeRepo.id,
              connectionId: activeRepo.connectionId ?? null,
              executionHostId: activeRepo.executionHostId ?? null
            }
          : null
      ),
    [activeRepo, settings]
  )

  const gitContext = useMemo<RuntimeGitContext | null>(() => {
    if (!activeWorktreeId || !worktreePath || isFolder) {
      return null
    }
    return {
      settings: repoSettings,
      worktreeId: activeWorktreeId,
      worktreePath,
      connectionId: getConnectionId(activeWorktreeId) ?? undefined
    }
  }, [activeWorktreeId, isFolder, repoSettings, worktreePath])

  const refresh = useCallback(async (): Promise<void> => {
    if (!gitContext || !activeWorktreeId || !worktreePath) {
      return
    }
    await refreshGitStatusForWorktree({
      settings: repoSettings,
      worktreeId: activeWorktreeId,
      worktreePath,
      connectionId: gitContext.connectionId,
      pushTarget: activeWorktree?.pushTarget,
      deps: { setGitStatus, updateWorktreeGitIdentity, setUpstreamStatus, fetchUpstreamStatus }
    })
  }, [
    activeWorktree?.pushTarget,
    activeWorktreeId,
    fetchUpstreamStatus,
    gitContext,
    repoSettings,
    setGitStatus,
    setUpstreamStatus,
    updateWorktreeGitIdentity,
    worktreePath
  ])

  // Why one wrapper: every mutation must serialize behind `busy`, surface its own
  // failure, and re-read status — silently swallowing leaves the panel lying.
  const run = useCallback(
    async <T>(fallbackMessage: string, operation: () => Promise<T>): Promise<T | null> => {
      if (!gitContext) {
        return null
      }
      setBusy(true)
      setLastError(null)
      try {
        const result = await operation()
        await refresh()
        return result
      } catch (error) {
        setLastError(errorMessage(error, fallbackMessage))
        return null
      } finally {
        setBusy(false)
      }
    },
    [gitContext, refresh]
  )

  const stage = useCallback(
    async (paths: string[]): Promise<void> => {
      if (!gitContext || paths.length === 0) {
        return
      }
      await run('Failed to stage changes', () =>
        paths.length === 1
          ? stageRuntimeGitPath(gitContext, paths[0])
          : bulkStageRuntimeGitPaths(gitContext, paths)
      )
    },
    [gitContext, run]
  )

  const unstage = useCallback(
    async (paths: string[]): Promise<void> => {
      if (!gitContext || paths.length === 0) {
        return
      }
      await run('Failed to unstage changes', () =>
        paths.length === 1
          ? unstageRuntimeGitPath(gitContext, paths[0])
          : bulkUnstageRuntimeGitPaths(gitContext, paths)
      )
    },
    [gitContext, run]
  )

  const discard = useCallback(
    async (paths: string[]): Promise<void> => {
      if (!gitContext || paths.length === 0) {
        return
      }
      await run('Failed to discard changes', async () => {
        for (const path of paths) {
          await discardRuntimeGitPath(gitContext, path)
        }
      })
    },
    [gitContext, run]
  )

  const commit = useCallback(
    async (message: string, options?: { stageAllFirst?: boolean }): Promise<boolean> => {
      if (!gitContext) {
        return false
      }
      const stageablePaths = options?.stageAllFirst
        ? entries.filter((entry) => entry.area !== 'staged').map((entry) => entry.path)
        : []
      const result = await run('Failed to commit', async () => {
        if (stageablePaths.length > 0) {
          await bulkStageRuntimeGitPaths(gitContext, stageablePaths)
        }
        return commitRuntimeGit(gitContext, message)
      })
      if (!result) {
        return false
      }
      if (!result.success) {
        setLastError(result.error ?? 'Failed to commit')
        return false
      }
      return true
    },
    [entries, gitContext, run]
  )

  const publish = useCallback(async (): Promise<void> => {
    if (!gitContext || !activeWorktreeId || !worktreePath) {
      return
    }
    await run('Failed to publish branch', () =>
      pushBranch(activeWorktreeId, worktreePath, true, gitContext.connectionId, undefined, {
        runtimeTargetSettings: repoSettings
      })
    )
  }, [activeWorktreeId, gitContext, pushBranch, repoSettings, run, worktreePath])

  const sync = useCallback(async (): Promise<void> => {
    if (!gitContext || !activeWorktreeId || !worktreePath) {
      return
    }
    await run('Failed to sync branch', () =>
      syncBranch(activeWorktreeId, worktreePath, gitContext.connectionId, undefined, {
        runtimeTargetSettings: repoSettings
      })
    )
  }, [activeWorktreeId, gitContext, repoSettings, run, syncBranch, worktreePath])

  const diffOpeners = useVscodeScmDiffOpen(activeWorktreeId, worktreePath)

  return {
    ready: gitContext !== null,
    worktreeId: activeWorktreeId,
    worktreePath,
    repoSettings,
    entries,
    branch: shortBranchName(activeWorktree?.branch),
    upstreamStatus,
    conflictOperation,
    repositoryHuge,
    busy,
    lastError,
    clearError: useCallback(() => setLastError(null), []),
    refresh,
    stage,
    unstage,
    discard,
    commit,
    publish,
    sync,
    ...diffOpeners
  }
}

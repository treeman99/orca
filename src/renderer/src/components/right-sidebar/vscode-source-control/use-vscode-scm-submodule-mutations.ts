import { useCallback, useState } from 'react'
import { getConnectionId } from '@/lib/connection-context'
import { translate } from '@/i18n/i18n'
import {
  commitRuntimeGitSubmodule,
  discardRuntimeGitSubmodulePath,
  pullRuntimeGitSubmodule,
  pushRuntimeGitSubmodule,
  stageRuntimeGitSubmodulePaths,
  unstageRuntimeGitSubmodulePaths,
  type RuntimeGitContext
} from '@/runtime/runtime-git-client'
import { isSubmoduleWriteUnsupportedError } from '@/runtime/runtime-git-submodule-write-support'
import type { VscodeScmContext } from './use-vscode-scm-context'
import { resolveVscodeScmSubmoduleInnerPaths } from './vscode-scm-submodule-paths'
import type { VscodeScmActionButton } from './vscode-scm-action-button'

export type VscodeScmSubmoduleMutations = {
  busyPath: string | null
  errorByPath: Readonly<Record<string, string>>
  clearError: (submodulePath: string) => void
  stage: (submodulePath: string, paths: string[]) => Promise<void>
  unstage: (submodulePath: string, paths: string[]) => Promise<void>
  discard: (submodulePath: string, paths: string[]) => Promise<void>
  run: (
    submodulePath: string,
    button: VscodeScmActionButton,
    message: string,
    stageablePaths: readonly string[]
  ) => Promise<boolean>
}

function errorMessage(error: unknown, fallback: string): string {
  if (isSubmoduleWriteUnsupportedError(error)) {
    return error.message
  }
  return error instanceof Error && error.message ? error.message : fallback
}

const UNSAFE_PATH_MESSAGE = () =>
  translate(
    'sourceControl.submoduleUnsafePath',
    'Orca refused this path: it does not resolve inside the submodule.'
  )

/**
 * Drives each submodule's OWN git. Every call goes through the submodule-scoped runtime
 * API, which asserts host-side that the target really is a repository root before it
 * writes — the renderer must never assemble a path that skips that.
 *
 * After a write both the submodule and the parent are re-read: a commit or a discard moves
 * the gitlink the parent records, so refreshing only the submodule would leave the parent
 * section claiming a pointer change that is already gone (or missing one that just appeared).
 */
export function useVscodeScmSubmoduleMutations(
  scm: VscodeScmContext,
  refreshSubmodule: (submodulePath: string) => void
): VscodeScmSubmoduleMutations {
  const { repoSettings, worktreeId, worktreePath } = scm
  const [busyPath, setBusyPath] = useState<string | null>(null)
  const [errorByPath, setErrorByPath] = useState<Record<string, string>>({})

  const contextFor = useCallback((): RuntimeGitContext | null => {
    if (!worktreeId || !worktreePath) {
      return null
    }
    return {
      settings: repoSettings,
      worktreeId,
      worktreePath,
      connectionId: getConnectionId(worktreeId) ?? undefined
    }
  }, [repoSettings, worktreeId, worktreePath])

  const run = useCallback(
    async <T>(
      submodulePath: string,
      fallbackMessage: string,
      operation: (context: RuntimeGitContext) => Promise<T>
    ): Promise<T | null> => {
      const context = contextFor()
      if (!context) {
        return null
      }
      setBusyPath(submodulePath)
      setErrorByPath((prev) => {
        if (!(submodulePath in prev)) {
          return prev
        }
        const next = { ...prev }
        delete next[submodulePath]
        return next
      })
      try {
        return await operation(context)
      } catch (error) {
        setErrorByPath((prev) => ({
          ...prev,
          [submodulePath]: errorMessage(error, fallbackMessage)
        }))
        return null
      } finally {
        setBusyPath(null)
        refreshSubmodule(submodulePath)
        // Why the parent too: a submodule write moves the gitlink the parent records.
        void scm.refresh()
      }
    },
    [contextFor, refreshSubmodule, scm]
  )

  const withInnerPaths = useCallback(
    async (
      submodulePath: string,
      paths: string[],
      fallbackMessage: string,
      operation: (context: RuntimeGitContext, innerPaths: string[]) => Promise<void>
    ): Promise<void> => {
      if (paths.length === 0) {
        return
      }
      const innerPaths = resolveVscodeScmSubmoduleInnerPaths(submodulePath, paths)
      if (!innerPaths) {
        setErrorByPath((prev) => ({ ...prev, [submodulePath]: UNSAFE_PATH_MESSAGE() }))
        return
      }
      await run(submodulePath, fallbackMessage, (context) => operation(context, innerPaths))
    },
    [run]
  )

  return {
    busyPath,
    errorByPath,
    clearError: useCallback((submodulePath: string) => {
      setErrorByPath((prev) => {
        if (!(submodulePath in prev)) {
          return prev
        }
        const next = { ...prev }
        delete next[submodulePath]
        return next
      })
    }, []),
    stage: useCallback(
      (submodulePath, paths) =>
        withInnerPaths(submodulePath, paths, 'Failed to stage changes', (context, innerPaths) =>
          stageRuntimeGitSubmodulePaths(context, submodulePath, innerPaths)
        ),
      [withInnerPaths]
    ),
    unstage: useCallback(
      (submodulePath, paths) =>
        withInnerPaths(submodulePath, paths, 'Failed to unstage changes', (context, innerPaths) =>
          unstageRuntimeGitSubmodulePaths(context, submodulePath, innerPaths)
        ),
      [withInnerPaths]
    ),
    discard: useCallback(
      (submodulePath, paths) =>
        withInnerPaths(
          submodulePath,
          paths,
          'Failed to discard changes',
          async (context, innerPaths) => {
            for (const innerPath of innerPaths) {
              await discardRuntimeGitSubmodulePath(context, submodulePath, innerPath)
            }
          }
        ),
      [withInnerPaths]
    ),
    run: useCallback(
      async (submodulePath, button, message, stageablePaths): Promise<boolean> => {
        if (button.kind === 'publish') {
          const result = await run(submodulePath, 'Failed to push submodule', (context) =>
            pushRuntimeGitSubmodule(context, submodulePath, true)
          )
          return result !== null
        }
        if (button.kind === 'sync') {
          // VS Code's Sync Changes is pull THEN push. Push-only reports success while a
          // behind-only submodule stays behind; a pull failure must not be pushed over.
          const result = await run(submodulePath, 'Failed to sync submodule', async (context) => {
            await pullRuntimeGitSubmodule(context, submodulePath)
            await pushRuntimeGitSubmodule(context, submodulePath)
            return true
          })
          return result !== null
        }
        if (button.kind !== 'commit') {
          return false
        }
        const innerPaths = button.stagesAllFirst
          ? resolveVscodeScmSubmoduleInnerPaths(submodulePath, stageablePaths)
          : []
        if (!innerPaths) {
          setErrorByPath((prev) => ({ ...prev, [submodulePath]: UNSAFE_PATH_MESSAGE() }))
          return false
        }
        const result = await run(submodulePath, 'Failed to commit', async (context) => {
          if (innerPaths.length > 0) {
            await stageRuntimeGitSubmodulePaths(context, submodulePath, innerPaths)
          }
          return commitRuntimeGitSubmodule(context, submodulePath, message)
        })
        if (!result) {
          return false
        }
        if (!result.success) {
          setErrorByPath((prev) => ({
            ...prev,
            [submodulePath]: result.error ?? 'Failed to commit'
          }))
          return false
        }
        return true
      },
      [run]
    )
  }
}

import type { PreloadApi } from '../../../../preload/api-types'
import { toRuntimeWorktreeSelector } from '../../runtime/runtime-worktree-selector'
import { callRuntimeResult } from './web-runtime-calls'
import { resolveRuntimeWorktreeByPath } from './web-runtime-worktree-catalog'

type GitApi = NonNullable<Partial<PreloadApi>['git']>

/** Submodule SCM over the runtime RPC surface, split out of web-git-api for max-lines. */
export function createWebGitSubmoduleApi(): Pick<GitApi, 'submoduleDiscard' | 'submoduleRestorePointer' | 'submoduleList' | 'submoduleStage' | 'submoduleUnstage' | 'submoduleCommit' | 'submodulePush' | 'submodulePull'> {
  return {
    submoduleDiscard: async ({ worktreePath, submodulePath, filePath }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeResult('git.submoduleDiscard', {
        worktree: toRuntimeWorktreeSelector(worktree.id),
        submodulePath,
        filePath
      })
    },
    submoduleRestorePointer: async ({ worktreePath, submodulePath }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeResult('git.submoduleRestorePointer', {
        worktree: toRuntimeWorktreeSelector(worktree.id),
        submodulePath
      })
    },
    submoduleList: async ({ worktreePath }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeResult('git.submoduleList', {
        worktree: toRuntimeWorktreeSelector(worktree.id)
      })
    },
    submoduleStage: async ({ worktreePath, submodulePath, filePaths }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeResult('git.submoduleStage', {
        worktree: toRuntimeWorktreeSelector(worktree.id),
        submodulePath,
        filePaths
      })
    },
    submoduleUnstage: async ({ worktreePath, submodulePath, filePaths }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeResult('git.submoduleUnstage', {
        worktree: toRuntimeWorktreeSelector(worktree.id),
        submodulePath,
        filePaths
      })
    },
    submoduleCommit: async ({ worktreePath, submodulePath, message }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeResult('git.submoduleCommit', {
        worktree: toRuntimeWorktreeSelector(worktree.id),
        submodulePath,
        message
      })
    },
    submodulePush: async ({ worktreePath, submodulePath, publish }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeResult('git.submodulePush', {
        worktree: toRuntimeWorktreeSelector(worktree.id),
        submodulePath,
        ...(publish === undefined ? {} : { publish })
      })
    },
    submodulePull: async ({ worktreePath, submodulePath }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeResult('git.submodulePull', {
        worktree: toRuntimeWorktreeSelector(worktree.id),
        submodulePath
      })
    }
  }
}

import type { GitMergeConflictInputs } from '../../../../shared/git-merge-conflict-inputs'
import type { PreloadApi } from '../../../../preload/api-types'
import { toRuntimeWorktreeSelector } from '../../runtime/runtime-worktree-selector'
import { callRuntimeResult } from './web-runtime-calls'
import { resolveRuntimeFilePath } from './web-runtime-worktree-catalog'

type GitApi = NonNullable<Partial<PreloadApi>['git']>

/** Fork: merge editor stage reads over the runtime RPC surface. */
export function createWebGitMergeConflictApi(): Pick<GitApi, 'mergeConflictInputs'> {
  return {
    mergeConflictInputs: async ({ worktreePath, filePath }) => {
      const file = await resolveRuntimeFilePath(filePath, worktreePath)
      return callRuntimeResult<GitMergeConflictInputs>('git.mergeConflictInputs', {
        worktree: toRuntimeWorktreeSelector(file.worktree.id),
        filePath: file.relativePath
      })
    }
  }
}

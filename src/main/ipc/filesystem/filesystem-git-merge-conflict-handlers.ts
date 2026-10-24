import { ipcMain } from 'electron'
import { getConnectionExecutionHostId } from '../../../shared/execution-host'
import type { GitMergeConflictInputs } from '../../../shared/git-merge-conflict-inputs'
import { readMergeConflictInputs } from '../../git/source-control/merge-conflict-inputs'
import { requireReachableGitRoute } from '../../providers/execution-host-provider-dispatch'
import { validateGitRelativeFilePath } from '../filesystem-path-containment'
import { getLocalGitOptionsForRegisteredWorktree } from '../local-worktree-runtime-options'
import { resolveRegisteredWorktreePath } from '../registered-worktree-roots-cache'
import type { FilesystemHandlerContext } from './filesystem-handler-context'

export function registerFilesystemGitMergeConflictHandlers(
  context: FilesystemHandlerContext
): void {
  const { store } = context

  // Why the git:diff guards: the same registered-worktree and path-containment checks gate every index read.
  ipcMain.handle(
    'git:mergeConflictInputs',
    async (
      _event,
      args: { worktreePath: string; filePath: string; connectionId?: string }
    ): Promise<GitMergeConflictInputs> => {
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const filePath = validateGitRelativeFilePath(worktreePath, args.filePath)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return readMergeConflictInputs(worktreePath, filePath, {
        ...gitOptions,
        admissionTier: 'interactive'
      })
    }
  )
}

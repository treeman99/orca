/**
 * Shared argument resolution for the submodule staging IPC handlers.
 *
 * Why validate against the SUBMODULE root: `filePaths` are relative to it, so checking
 * them against the parent worktree would accept a name that escapes the submodule.
 */
import type { Store } from '../persistence'
import type { GitRuntimeOptions } from '../git/git-runtime-options'
import { resolveSubmoduleWorktreePath } from '../git/status'
import { resolveRegisteredWorktreePath } from './registered-worktree-roots-cache'
import { validateGitRelativeFilePath } from './filesystem-path-containment'
import { getLocalGitOptionsForRegisteredWorktree } from './local-worktree-runtime-options'

export type SubmodulePathsIpcArgs = {
  worktreePath: string
  submodulePath: string
  /** Relative to the SUBMODULE root, not the parent worktree. */
  filePaths: string[]
  connectionId?: string
}

export async function resolveSubmoduleStagingIpcTarget(
  args: SubmodulePathsIpcArgs,
  store: Store
): Promise<{ worktreePath: string; filePaths: string[]; gitOptions: GitRuntimeOptions }> {
  const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
  const gitOptions = getLocalGitOptionsForRegisteredWorktree(store, args.worktreePath, worktreePath)
  const submoduleWorktreePath = resolveSubmoduleWorktreePath(worktreePath, args.submodulePath)
  const filePaths = args.filePaths.map((filePath) =>
    validateGitRelativeFilePath(submoduleWorktreePath, filePath)
  )
  return { worktreePath, filePaths, gitOptions }
}

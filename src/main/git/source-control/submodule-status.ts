import type { GetStatusOptions } from './get-status-options'
import type { GitStatusResult } from '../../../shared/git-status-types'
import { getStatus } from './status-read'
import { resolveSubmoduleWorktreePath } from './submodule-paths'
import { assertSubmoduleWorktreeRoot } from './submodule-destructive-ops'

/**
 * Run a plain status inside a submodule's own worktree (lazy "expand submodule"
 * flow). Entry paths are relative to the submodule root; the renderer prefixes them.
 *
 * This is deliberately nothing more than `git status` in that directory. It used to also
 * synthesize rows for the files between the parent's recorded gitlink and the submodule's
 * checked-out HEAD, which put someone else's already-committed files in a list the user
 * reads as their own working changes. Those files belong to the submodule's history; the
 * pointer move itself is expressed by the gitlink row's own diff.
 *
 * `staged` is accepted and ignored: the IPC/RPC contract still carries it, and a submodule's
 * status is the same question whichever parent section its gitlink row happens to sit in.
 */
export async function getSubmoduleStatus(
  worktreePath: string,
  submodulePath: string,
  options: GetStatusOptions & { staged?: boolean } = {}
): Promise<GitStatusResult> {
  const submoduleWorktreePath = resolveSubmoduleWorktreePath(worktreePath, submodulePath)
  await assertSubmoduleWorktreeRoot(submoduleWorktreePath, options)
  return getStatus(submoduleWorktreePath, options)
}

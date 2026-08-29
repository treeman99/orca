import type { GitRuntimeOptions } from '../git-runtime-options'
import { gitOptionsForWorktree } from '../git-runtime-options'
import { gitExecFileAsync, gitOptionalLocksDisabledEnv } from '../runner'
import { literalPathspec } from './git-pathspec'
import { invalidateGitReadCaches } from './git-read-cache-invalidation'
import { discardChanges } from './discard-changes'
import { resolveSubmoduleWorktreePath } from './submodule-paths'

/**
 * Refuse a path that is inside a repository but is not its root.
 *
 * Why this is not paranoia: `resolveSubmoduleWorktreePath` only proves the path stays
 * within the parent. Once a submodule is deinitialized, moved, or left behind by a branch
 * switch, that directory is an ordinary folder — and git walks UP from it to the parent
 * repository, so a command aimed at the submodule silently runs against the parent and,
 * for a destructive one, rewrites the parent's copy of the file.
 *
 * `--show-prefix` rather than comparing `--show-toplevel` to the path: it answers "how far
 * below the root am I" directly, so WSL mounts, symlinked checkouts, and case-insensitive
 * filesystems cannot make two spellings of the same directory disagree.
 */
export async function assertSubmoduleWorktreeRoot(
  submoduleWorktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<void> {
  let prefix: string
  try {
    const { stdout } = await gitExecFileAsync(['rev-parse', '--show-prefix'], {
      ...gitOptionsForWorktree(submoduleWorktreePath, options),
      env: gitOptionalLocksDisabledEnv()
    })
    prefix = stdout.trim()
  } catch {
    throw new Error('Access denied: submodule path is not a git repository')
  }
  if (prefix !== '') {
    throw new Error('Access denied: submodule path is not a git repository root')
  }
}

/**
 * Discard a file that lives inside a submodule, in that submodule's own repository.
 *
 * Why a separate entry point rather than a flag on `discardChanges`: the two paths it
 * validates against — the worktree boundary and the realpath used for untracked removal —
 * both have to move to the submodule root, and the caller is the only place that knows the
 * file path is submodule-relative. Delegating keeps one implementation of the symlink and
 * containment checks instead of a second copy that can drift.
 *
 * The root assertion is not optional. `resolveSubmoduleWorktreePath` only proves containment
 * in the parent, so for a submodule that is currently a plain directory git would walk up and
 * restore the PARENT's copy of a same-named file over the user's.
 */
export async function discardSubmoduleChanges(
  worktreePath: string,
  submodulePath: string,
  filePath: string,
  options: GitRuntimeOptions = {}
): Promise<void> {
  const submoduleWorktreePath = resolveSubmoduleWorktreePath(worktreePath, submodulePath)
  await assertSubmoduleWorktreeRoot(submoduleWorktreePath, options)
  await discardChanges(submoduleWorktreePath, filePath, options)
}

/**
 * Restore a submodule pointer to the commit the parent records (`git submodule update`).
 *
 * This is what a discard on the gitlink row means: `git restore` cannot do it — on a moved
 * or dirty pointer it exits 0 having changed nothing, and on a deleted submodule directory it
 * clears the row while leaving an empty, uninitialized directory behind.
 *
 * `--init` so a submodule the user deleted comes back rather than reappearing as an empty
 * directory. The caller must have warned that this leaves the submodule on a detached HEAD:
 * whatever branch was checked out inside it is not preserved.
 */
export async function restoreSubmodulePointer(
  worktreePath: string,
  submodulePath: string,
  options: GitRuntimeOptions = {}
): Promise<void> {
  invalidateGitReadCaches()
  // Validates containment before the path reaches a command that writes.
  resolveSubmoduleWorktreePath(worktreePath, submodulePath)
  try {
    await gitExecFileAsync(
      ['submodule', 'update', '--init', '--', literalPathspec(submodulePath, options)],
      { ...gitOptionsForWorktree(worktreePath, options) }
    )
  } finally {
    invalidateGitReadCaches()
  }
}

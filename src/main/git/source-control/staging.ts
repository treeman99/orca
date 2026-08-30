import type { GitRuntimeOptions } from '../git-runtime-options'
import { gitOptionsForWorktree } from '../git-runtime-options'
import { gitExecFileAsync } from '../runner'
import { invalidateGitReadCaches } from './git-read-cache-invalidation'
import { bulkPathspecCommands, literalPathspec } from './git-pathspec'
import { isUnbornHeadGitError } from '../../../shared/git-unborn-head-error'

/**
 * Stage a file.
 */
export async function stageFile(
  worktreePath: string,
  filePath: string,
  options: GitRuntimeOptions = {}
): Promise<void> {
  invalidateGitReadCaches()
  try {
    await gitExecFileAsync(
      ['add', '--', literalPathspec(filePath, options)],
      gitOptionsForWorktree(worktreePath, options)
    )
  } finally {
    invalidateGitReadCaches()
  }
}

/**
 * Unstage a file.
 */
/**
 * `git restore --staged`, falling back to `git reset` before the first commit.
 *
 * Why the fallback: `restore --staged` resolves HEAD and exits 128 on an unborn branch,
 * so a repository with no commit yet — the normal state of a freshly added submodule —
 * could stage but never unstage. `reset` treats a missing HEAD as the empty tree.
 */
async function unstagePathspecs(
  worktreePath: string,
  pathspecs: string[],
  options: GitRuntimeOptions
): Promise<void> {
  try {
    await gitExecFileAsync(['restore', '--staged', '--', ...pathspecs], {
      ...gitOptionsForWorktree(worktreePath, options)
    })
  } catch (error) {
    if (!isUnbornHeadGitError(error)) {
      throw error
    }
    await gitExecFileAsync(['reset', '-q', '--', ...pathspecs], {
      ...gitOptionsForWorktree(worktreePath, options)
    })
  }
}

export async function unstageFile(
  worktreePath: string,
  filePath: string,
  options: GitRuntimeOptions = {}
): Promise<void> {
  invalidateGitReadCaches()
  try {
    await unstagePathspecs(worktreePath, [literalPathspec(filePath, options)], options)
  } finally {
    invalidateGitReadCaches()
  }
}

/**
 * Bulk stage files in batches to avoid E2BIG.
 */
export async function bulkStageFiles(
  worktreePath: string,
  filePaths: string[],
  options: GitRuntimeOptions = {}
): Promise<void> {
  invalidateGitReadCaches()
  if (filePaths.length === 0) {
    return
  }
  try {
    for (const args of bulkPathspecCommands(['add', '--'], filePaths, worktreePath, options)) {
      await gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))
    }
  } finally {
    invalidateGitReadCaches()
  }
}

/**
 * Bulk unstage files in batches to avoid E2BIG.
 */
export async function bulkUnstageFiles(
  worktreePath: string,
  filePaths: string[],
  options: GitRuntimeOptions = {}
): Promise<void> {
  invalidateGitReadCaches()
  if (filePaths.length === 0) {
    return
  }
  try {
    const commands = bulkPathspecCommands(
      ['restore', '--staged', '--'],
      filePaths,
      worktreePath,
      options
    )
    for (const args of commands) {
      // Take upstream's byte-budget chunking, but keep every chunk on the unborn-HEAD fallback.
      await unstagePathspecs(worktreePath, args.slice(3), options)
    }
  } finally {
    invalidateGitReadCaches()
  }
}

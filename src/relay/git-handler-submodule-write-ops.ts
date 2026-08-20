/**
 * Submodule write operations for the SSH relay — the remote half of "treat a submodule
 * as a separate repository". Kept in lockstep with src/main/git/submodule-write-ops.ts;
 * a divergence here is invisible to a local workspace.
 *
 * Every mutating entry point runs resolveSubmoduleWorktreePath (containment) THEN
 * assertSubmoduleWorktreeRoot (that directory really is a repository root). Without the
 * second check a deinitialized or moved submodule is a plain directory and git walks up
 * to the parent, so the command mutates the parent repository instead.
 */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  limitDetectedSubmodules,
  type GitSubmoduleListResult,
  type GitSubmoduleSummary
} from '../shared/git-submodule-list'
import { isUnbornHeadGitError } from '../shared/git-unborn-head-error'
import type { GitExec } from './git-handler-ops'
import {
  assertSubmoduleWorktreeRoot,
  listSubmoduleConfigEntriesCached,
  resolveSubmoduleWorktreePath,
  type SubmodulePathsCache
} from './git-handler-submodule-ops'

export async function listSubmodulesRelay(
  git: GitExec,
  worktreePath: string,
  cache: SubmodulePathsCache,
  now: number = Date.now()
): Promise<GitSubmoduleListResult> {
  const configured = await listSubmoduleConfigEntriesCached(git, worktreePath, cache, now)
  const { entries, didHitLimit } = limitDetectedSubmodules(configured)
  const submodules: GitSubmoduleSummary[] = []
  for (const entry of entries) {
    let submoduleWorktreePath: string
    try {
      submoduleWorktreePath = resolveSubmoduleWorktreePath(worktreePath, entry.path)
    } catch {
      // `.gitmodules` is repo-controlled; drop a path that escapes the worktree.
      continue
    }
    submodules.push({ ...entry, initialized: await hasGitEntry(submoduleWorktreePath) })
  }
  return { submodules, didHitLimit }
}

/** `.git` is a directory in a standalone clone and a file in a submodule checkout. */
async function hasGitEntry(submoduleWorktreePath: string): Promise<boolean> {
  try {
    await fs.stat(path.join(submoduleWorktreePath, '.git'))
    return true
  } catch {
    return false
  }
}

export async function resolveSubmoduleRootRelay(
  git: GitExec,
  worktreePath: string,
  submodulePath: string
): Promise<string> {
  const submoduleWorktreePath = resolveSubmoduleWorktreePath(worktreePath, submodulePath)
  await assertSubmoduleWorktreeRoot(git, submoduleWorktreePath)
  return submoduleWorktreePath
}

/**
 * `git restore --staged`, falling back to `git reset` before the first commit.
 *
 * Mirrors src/main/git/status.ts: `restore --staged` resolves HEAD and exits 128 on an
 * unborn branch, so a freshly added submodule could stage but never unstage.
 */
export async function unstagePathspecsRelay(
  git: GitExec,
  worktreePath: string,
  pathspecs: string[]
): Promise<void> {
  try {
    await git(['restore', '--staged', '--', ...pathspecs], worktreePath)
  } catch (error) {
    if (!isUnbornHeadGitError(error)) {
      throw error
    }
    await git(['reset', '-q', '--', ...pathspecs], worktreePath)
  }
}

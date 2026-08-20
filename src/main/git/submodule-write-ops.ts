/**
 * Write operations scoped to a submodule's OWN repository — the "treat a submodule as a
 * separate repository" half of Source Control. Every entry point re-uses the parent-repo
 * implementation with the submodule root as cwd, so staging semantics cannot drift.
 *
 * The two-step guard is mandatory on every mutating path:
 *   resolveSubmoduleWorktreePath  proves the path stays inside the parent worktree;
 *   assertSubmoduleWorktreeRoot   proves that directory IS a repository root.
 * Without the second step a deinitialized / moved / branch-switched-away submodule is a
 * plain directory, git walks UP to the parent, and the command silently mutates the
 * parent repository instead.
 */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  limitDetectedSubmodules,
  type GitSubmoduleListResult,
  type GitSubmoduleSummary
} from '../../shared/git-submodule-list'
import type { GitRuntimeOptions } from './git-runtime-options'
import { gitPull, gitPush } from './remote'
import {
  assertSubmoduleWorktreeRoot,
  bulkStageFiles,
  bulkUnstageFiles,
  commitChanges,
  listSubmoduleConfigEntries,
  resolveSubmoduleWorktreePath
} from './status'

/**
 * Configured submodules plus whether each one is initialized.
 *
 * The `.gitmodules` read behind this is already TTL-cached (5s) and invalidated by every
 * git mutation, so a Source Control poll costs at most one `git config` plus one stat per
 * submodule. A folder workspace or a non-repo degrades to an empty list.
 */
export async function listSubmodules(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<GitSubmoduleListResult> {
  const configured = await listSubmoduleConfigEntries(worktreePath, options)
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

async function resolveSubmoduleRoot(
  worktreePath: string,
  submodulePath: string,
  options: GitRuntimeOptions
): Promise<string> {
  const submoduleWorktreePath = resolveSubmoduleWorktreePath(worktreePath, submodulePath)
  await assertSubmoduleWorktreeRoot(submoduleWorktreePath, options)
  return submoduleWorktreePath
}

/** `filePaths` are relative to the SUBMODULE root. */
export async function stageSubmoduleFiles(
  worktreePath: string,
  submodulePath: string,
  filePaths: string[],
  options: GitRuntimeOptions = {}
): Promise<void> {
  const root = await resolveSubmoduleRoot(worktreePath, submodulePath, options)
  await bulkStageFiles(root, filePaths, options)
}

/** `filePaths` are relative to the SUBMODULE root. */
export async function unstageSubmoduleFiles(
  worktreePath: string,
  submodulePath: string,
  filePaths: string[],
  options: GitRuntimeOptions = {}
): Promise<void> {
  const root = await resolveSubmoduleRoot(worktreePath, submodulePath, options)
  await bulkUnstageFiles(root, filePaths, options)
}

/** Keeps the parent-repo commit contract: reports failure as a result, never a throw. */
export async function commitSubmoduleChanges(
  worktreePath: string,
  submodulePath: string,
  message: string,
  options: GitRuntimeOptions = {}
): Promise<{ success: boolean; error?: string }> {
  let root: string
  try {
    root = await resolveSubmoduleRoot(worktreePath, submodulePath, options)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Commit failed' }
  }
  return commitChanges(root, message, options)
}

/** `publish` is accepted for symmetry with the parent push; upstream is always set. */
export async function pushSubmodule(
  worktreePath: string,
  submodulePath: string,
  publish = false,
  options: GitRuntimeOptions = {}
): Promise<void> {
  const root = await resolveSubmoduleRoot(worktreePath, submodulePath, options)
  await gitPush(root, publish, undefined, options)
}

/**
 * Pull the submodule's OWN branch. Re-uses the parent `gitPull`, so the user's configured
 * merge/rebase strategy and the divergence fallback behave identically in both repositories.
 */
export async function pullSubmodule(
  worktreePath: string,
  submodulePath: string,
  options: GitRuntimeOptions = {}
): Promise<void> {
  const root = await resolveSubmoduleRoot(worktreePath, submodulePath, options)
  await gitPull(root, undefined, options)
}

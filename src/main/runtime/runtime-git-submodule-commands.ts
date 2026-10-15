import { discardSubmoduleChanges, restoreSubmodulePointer } from '../git/status'
import {
  commitSubmoduleChanges,
  listSubmodules,
  pullSubmodule,
  pushSubmodule,
  stageSubmoduleFiles,
  unstageSubmoduleFiles
} from '../git/submodule-write-ops'
import type { GitSubmoduleListResult } from '../../shared/git-submodule-list'
import {
  localGitOptionsForTarget,
  normalizeRuntimeGitRelativePath,
  requireLocalRuntimeGitRoute,
  type RuntimeGitCommandHost
} from './runtime-git-command-target'

/** Fork-owned: submodule SCM parity with VS Code. Parent gitlink vs the submodule's own status. */
export class RuntimeGitSubmoduleCommands {
  constructor(private readonly host: RuntimeGitCommandHost) {}

  /**
   * Discard a file inside a submodule. `filePath` is relative to the SUBMODULE root.
   *
   * The path is normalized once, before the branch, so a `.`/`./x`/backslash spelling cannot
   * behave one way locally and another over SSH — an empty pathspec means the whole worktree.
   */
  async discardRuntimeGitSubmodulePath(
    worktreeSelector: string,
    submodulePath: string,
    filePath: string
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePath = normalizeRuntimeGitRelativePath(filePath)
    const relativeSubmodulePath = normalizeRuntimeGitRelativePath(submodulePath)
    // An `ssh:` worktree is not served here (requireLocalRuntimeGitRoute throws).
    requireLocalRuntimeGitRoute(target)
    await discardSubmoduleChanges(
      target.worktree.path,
      relativeSubmodulePath,
      relativePath,
      localGitOptionsForTarget(target)
    )
    return { ok: true }
  }

  /** Configured submodules of the parent worktree (capped; see MAX_DETECTED_SUBMODULES). */
  async listRuntimeGitSubmodules(worktreeSelector: string): Promise<GitSubmoduleListResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    // An `ssh:` worktree is not served here (requireLocalRuntimeGitRoute throws).
    requireLocalRuntimeGitRoute(target)
    return listSubmodules(target.worktree.path, localGitOptionsForTarget(target))
  }

  /** `filePaths` are relative to the SUBMODULE root. */
  async stageRuntimeGitSubmodulePaths(
    worktreeSelector: string,
    submodulePath: string,
    filePaths: string[]
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativeSubmodulePath = normalizeRuntimeGitRelativePath(submodulePath)
    const relativePaths = filePaths.map((filePath) => normalizeRuntimeGitRelativePath(filePath))
    // An `ssh:` worktree is not served here (requireLocalRuntimeGitRoute throws).
    requireLocalRuntimeGitRoute(target)
    await stageSubmoduleFiles(
      target.worktree.path,
      relativeSubmodulePath,
      relativePaths,
      localGitOptionsForTarget(target)
    )
    return { ok: true }
  }

  /** `filePaths` are relative to the SUBMODULE root. */
  async unstageRuntimeGitSubmodulePaths(
    worktreeSelector: string,
    submodulePath: string,
    filePaths: string[]
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativeSubmodulePath = normalizeRuntimeGitRelativePath(submodulePath)
    const relativePaths = filePaths.map((filePath) => normalizeRuntimeGitRelativePath(filePath))
    // An `ssh:` worktree is not served here (requireLocalRuntimeGitRoute throws).
    requireLocalRuntimeGitRoute(target)
    await unstageSubmoduleFiles(
      target.worktree.path,
      relativeSubmodulePath,
      relativePaths,
      localGitOptionsForTarget(target)
    )
    return { ok: true }
  }

  async commitRuntimeGitSubmodule(
    worktreeSelector: string,
    submodulePath: string,
    message: string
  ): Promise<{ success: boolean; error?: string }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativeSubmodulePath = normalizeRuntimeGitRelativePath(submodulePath)
    // An `ssh:` worktree is not served here (requireLocalRuntimeGitRoute throws).
    requireLocalRuntimeGitRoute(target)
    return commitSubmoduleChanges(
      target.worktree.path,
      relativeSubmodulePath,
      message,
      localGitOptionsForTarget(target)
    )
  }

  async pushRuntimeGitSubmodule(
    worktreeSelector: string,
    submodulePath: string,
    publish = false
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativeSubmodulePath = normalizeRuntimeGitRelativePath(submodulePath)
    // An `ssh:` worktree is not served here (requireLocalRuntimeGitRoute throws).
    requireLocalRuntimeGitRoute(target)
    await pushSubmodule(
      target.worktree.path,
      relativeSubmodulePath,
      publish,
      localGitOptionsForTarget(target)
    )
    return { ok: true }
  }

  /** The pull half of a submodule Sync Changes; push is a separate call. */
  async pullRuntimeGitSubmodule(
    worktreeSelector: string,
    submodulePath: string
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativeSubmodulePath = normalizeRuntimeGitRelativePath(submodulePath)
    // An `ssh:` worktree is not served here (requireLocalRuntimeGitRoute throws).
    requireLocalRuntimeGitRoute(target)
    await pullSubmodule(
      target.worktree.path,
      relativeSubmodulePath,
      localGitOptionsForTarget(target)
    )
    return { ok: true }
  }

  /** Put a submodule pointer back to the commit the parent records. Detaches its HEAD. */
  async restoreRuntimeGitSubmodulePointer(
    worktreeSelector: string,
    submodulePath: string
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativeSubmodulePath = normalizeRuntimeGitRelativePath(submodulePath)
    // An `ssh:` worktree is not served here (requireLocalRuntimeGitRoute throws).
    requireLocalRuntimeGitRoute(target)
    await restoreSubmodulePointer(
      target.worktree.path,
      relativeSubmodulePath,
      localGitOptionsForTarget(target)
    )
    return { ok: true }
  }
}

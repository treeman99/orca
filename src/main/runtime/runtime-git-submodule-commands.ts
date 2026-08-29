import {
  discardSubmoduleChanges,
  restoreSubmodulePointer
} from '../git/status'
import {
  commitSubmoduleChanges,
  listSubmodules,
  pullSubmodule,
  pushSubmodule,
  stageSubmoduleFiles,
  unstageSubmoduleFiles
} from '../git/submodule-write-ops'
import {
  getSshGitProvider,
  SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE
} from '../providers/ssh-git-dispatch'
import type { IGitProvider } from '../providers/types'
import type { GitSubmoduleListResult } from '../../shared/git-submodule-list'
import {
  localGitOptionsForTarget,
  normalizeRuntimeGitRelativePath,
  type RuntimeGitCommandHost
} from './runtime-git-command-target'

/** Fork-owned: submodule SCM parity with VS Code. Parent gitlink vs the submodule's own status. */
export class RuntimeGitSubmoduleCommands {
  constructor(private readonly host: RuntimeGitCommandHost) {}

  private requireSshProvider(connectionId: string): IGitProvider {
    const provider = getSshGitProvider(connectionId)
    if (!provider) {
      throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
    }
    return provider
  }

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
    if (target.connectionId) {
      const provider = getSshGitProvider(target.connectionId)
      if (!provider) {
        throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
      }
      await provider.discardSubmoduleChanges(
        target.worktree.path,
        relativeSubmodulePath,
        relativePath
      )
      return { ok: true }
    }
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
    if (target.connectionId) {
      return this.requireSshProvider(target.connectionId).listSubmodules(target.worktree.path)
    }
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
    if (target.connectionId) {
      await this.requireSshProvider(target.connectionId).stageSubmoduleFiles(
        target.worktree.path,
        relativeSubmodulePath,
        relativePaths
      )
      return { ok: true }
    }
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
    if (target.connectionId) {
      await this.requireSshProvider(target.connectionId).unstageSubmoduleFiles(
        target.worktree.path,
        relativeSubmodulePath,
        relativePaths
      )
      return { ok: true }
    }
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
    if (target.connectionId) {
      return this.requireSshProvider(target.connectionId).commitSubmodule(
        target.worktree.path,
        relativeSubmodulePath,
        message
      )
    }
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
    if (target.connectionId) {
      await this.requireSshProvider(target.connectionId).pushSubmodule(
        target.worktree.path,
        relativeSubmodulePath,
        publish
      )
      return { ok: true }
    }
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
    if (target.connectionId) {
      await this.requireSshProvider(target.connectionId).pullSubmodule(
        target.worktree.path,
        relativeSubmodulePath
      )
      return { ok: true }
    }
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
    if (target.connectionId) {
      const provider = getSshGitProvider(target.connectionId)
      if (!provider) {
        throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
      }
      await provider.restoreSubmodulePointer(target.worktree.path, relativeSubmodulePath)
      return { ok: true }
    }
    await restoreSubmodulePointer(
      target.worktree.path,
      relativeSubmodulePath,
      localGitOptionsForTarget(target)
    )
    return { ok: true }
  }
}

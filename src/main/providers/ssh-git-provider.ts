import type { CommitMessageDraftContext } from '../../shared/commit-message-generation'
import { gitExecMutatesRepository } from '../../shared/git-exec-mutation'
import { buildHostedRemoteCommitUrl, buildHostedRemoteFileUrl } from '../git/hosted-remote-url'
import {
  describeMaxBufferOverflowError,
  isMaxBufferOverflowError
} from '../git/max-buffer-overflow'
import { requestGitStreamable } from '../ssh/ssh-git-response-stream-reader'
import type { GitSubmoduleListResult } from '../../shared/git-submodule-list'
import { SUBMODULE_WRITE_UNSUPPORTED_MESSAGE } from '../../shared/git-submodule-write-support'
import type { IGitProvider } from './types'
import { isJsonRpcMethodNotFoundError } from './ssh-git-relay-errors'
import { SshGitWorktreeProvider } from './ssh-git-worktree-provider'

export class SshGitProvider extends SshGitWorktreeProvider implements IGitProvider {
  async getStagedCommitContext(worktreePath: string): Promise<CommitMessageDraftContext | null> {
    const branchPromise = this.exec(['branch', '--show-current'], worktreePath).catch(() => ({
      stdout: ''
    }))
    const [branchResult, summaryResult] = await Promise.all([
      branchPromise,
      this.exec(['diff', '--cached', '--name-status'], worktreePath)
    ])
    const stagedSummary = summaryResult.stdout.trim()
    if (!stagedSummary) {
      return null
    }
    let stagedPatch = ''
    try {
      const patchResult = await this.exec(
        ['diff', '--cached', '--patch', '--minimal', '--no-color', '--no-ext-diff'],
        worktreePath
      )
      stagedPatch = patchResult.stdout
    } catch (error) {
      if (!isMaxBufferOverflowError(error)) {
        throw error
      }
      console.warn(
        '[ssh-git] Staged patch too large to read; using file summary only:',
        describeMaxBufferOverflowError(error)
      )
    }
    return {
      branch: branchResult.stdout.trim() || null,
      stagedSummary,
      stagedPatch
    }
  }

  async exec(
    args: string[],
    cwd: string,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string }> {
    const run = () =>
      options
        ? requestGitStreamable(this.mux, 'git.exec', { args, cwd }, options)
        : requestGitStreamable(this.mux, 'git.exec', { args, cwd })
    const result = gitExecMutatesRepository(args)
      ? await this.runWithGitReadInvalidation(run)
      : await run()
    return result as { stdout: string; stderr: string }
  }

  async clone(
    args: string[],
    cwd: string,
    options?: {
      signal?: AbortSignal
      timeoutMs?: number
      onProgress?: (progress: { phase: string; percent: number }) => void
    }
  ): Promise<{ stdout: string; stderr: string }> {
    return this.runWithGitReadInvalidation(async () => {
      const progressId = `clone-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const unsubscribe = options?.onProgress
        ? this.mux.onNotificationByMethod('git.cloneProgress', (params) => {
            if (params.progressId !== progressId) {
              return
            }
            const phase = params.phase
            const percent = params.percent
            if (typeof phase === 'string' && typeof percent === 'number') {
              options.onProgress?.({ phase, percent })
            }
          })
        : undefined
      try {
        const result = await this.mux.request(
          'git.clone',
          { args, cwd, progressId },
          { signal: options?.signal, timeoutMs: options?.timeoutMs }
        )
        return result as { stdout: string; stderr: string }
      } catch (error) {
        if (isJsonRpcMethodNotFoundError(error)) {
          throw new Error(
            'SSH clone support is unavailable on this relay. Reconnect the SSH target to update Orca on the host, then try again.'
          )
        }
        throw error
      } finally {
        unsubscribe?.()
      }
    })
  }

  async isGitRepoAsync(dirPath: string): Promise<{ isRepo: boolean; rootPath: string | null }> {
    return (await this.mux.request('git.isGitRepo', { dirPath })) as {
      isRepo: boolean
      rootPath: string | null
    }
  }

  // Remote paths are validated asynchronously by the relay before registration.
  isGitRepo(_path: string): boolean {
    return true
  }

  private async readOriginRemoteUrl(worktreePath: string): Promise<string | null> {
    try {
      const result = await this.exec(['remote', 'get-url', 'origin'], worktreePath)
      return result.stdout.trim() || null
    } catch {
      return null
    }
  }

  async getRemoteFileUrl(
    worktreePath: string,
    relativePath: string,
    line: number
  ): Promise<string | null> {
    const remoteUrl = await this.readOriginRemoteUrl(worktreePath)
    if (!remoteUrl) {
      return null
    }

    let defaultBranch = 'main'
    try {
      const refResult = await this.exec(
        ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'],
        worktreePath
      )
      const ref = refResult.stdout.trim()
      if (ref) {
        defaultBranch = ref.replace(/^refs\/remotes\/origin\//, '')
      }
    } catch {
      // Fall back to 'main'.
    }

    return buildHostedRemoteFileUrl(remoteUrl, relativePath, defaultBranch, line)
  }

  async getRemoteCommitUrl(worktreePath: string, sha: string): Promise<string | null> {
    const remoteUrl = await this.readOriginRemoteUrl(worktreePath)
    if (!remoteUrl) {
      return null
    }
    return buildHostedRemoteCommitUrl(remoteUrl, sha)
  }

  async discardSubmoduleChanges(
    worktreePath: string,
    submodulePath: string,
    filePath: string
  ): Promise<void> {
    try {
      await this.runWithGitReadInvalidation(() =>
        this.mux.request('git.submoduleDiscard', { worktreePath, submodulePath, filePath })
      )
    } catch (error) {
      // Why not let this fail silently: an older relay would answer method-not-found and the
      // user would be told nothing while believing the file was restored.
      if (isJsonRpcMethodNotFoundError(error)) {
        throw new Error(
          'SSH submodule discard is unavailable on this relay. Reconnect the SSH target to update Orca on the host, then try again.'
        )
      }
      throw error
    }
  }

  async restoreSubmodulePointer(worktreePath: string, submodulePath: string): Promise<void> {
    try {
      await this.runWithGitReadInvalidation(() =>
        this.mux.request('git.submoduleRestorePointer', { worktreePath, submodulePath })
      )
    } catch (error) {
      if (isJsonRpcMethodNotFoundError(error)) {
        throw new Error(
          'SSH submodule restore is unavailable on this relay. Reconnect the SSH target to update Orca on the host, then try again.'
        )
      }
      throw error
    }
  }

  /**
   * Submodule write ops shipped after the oldest relay a client may pair with. An old
   * relay answers method-not-found; rethrow one recognizable message so the renderer can
   * degrade explicitly instead of showing a JSON-RPC error or appearing to succeed.
   */
  private async requestSubmoduleWrite<T>(method: string, params: Record<string, unknown>) {
    try {
      return (await this.runWithGitReadInvalidation(() => this.mux.request(method, params))) as T
    } catch (error) {
      if (isJsonRpcMethodNotFoundError(error)) {
        throw new Error(SUBMODULE_WRITE_UNSUPPORTED_MESSAGE)
      }
      throw error
    }
  }

  async listSubmodules(worktreePath: string): Promise<GitSubmoduleListResult> {
    return this.requestSubmoduleWrite<GitSubmoduleListResult>('git.submoduleList', {
      worktreePath
    })
  }

  async stageSubmoduleFiles(
    worktreePath: string,
    submodulePath: string,
    filePaths: string[]
  ): Promise<void> {
    await this.requestSubmoduleWrite('git.submoduleStage', {
      worktreePath,
      submodulePath,
      filePaths
    })
  }

  async unstageSubmoduleFiles(
    worktreePath: string,
    submodulePath: string,
    filePaths: string[]
  ): Promise<void> {
    await this.requestSubmoduleWrite('git.submoduleUnstage', {
      worktreePath,
      submodulePath,
      filePaths
    })
  }

  async commitSubmodule(
    worktreePath: string,
    submodulePath: string,
    message: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.requestSubmoduleWrite<{ success: boolean; error?: string }>('git.submoduleCommit', {
      worktreePath,
      submodulePath,
      message
    })
  }

  async pushSubmodule(
    worktreePath: string,
    submodulePath: string,
    publish?: boolean
  ): Promise<void> {
    await this.requestSubmoduleWrite('git.submodulePush', {
      worktreePath,
      submodulePath,
      ...(publish === undefined ? {} : { publish })
    })
  }

  async pullSubmodule(worktreePath: string, submodulePath: string): Promise<void> {
    await this.requestSubmoduleWrite('git.submodulePull', { worktreePath, submodulePath })
  }
}

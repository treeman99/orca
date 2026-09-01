import type { RequestContext } from './dispatcher'
import {
  GIT_BULK_CHUNK_SIZE,
  GitHandlerOperationContext,
  type GitHandlerOperationHost
} from './git-handler-operation-context'
import {
  assertSubmoduleWorktreeRoot,
  resolveSubmoduleWorktreePath
} from './git-handler-submodule-ops'
import {
  listSubmodulesRelay,
  resolveSubmoduleRootRelay,
  unstagePathspecsRelay
} from './git-handler-submodule-write-ops'
import type { GitSubmoduleListResult } from '../shared/git-submodule-list'
import { commitChangesRelay } from './git-handler-worktree-ops'
import { resolveRelayPushTarget } from './git-handler-push-target'
import { normalizeGitErrorMessage } from '../shared/git-remote-error'
import type { GitHandlerDiscardOperations } from './git-handler-discard-operations'
import type { GitHandlerSyncOperations } from './git-handler-sync-operations'

/**
 * The submodule write lane: every op below resolves the submodule's own worktree root first,
 * because `resolveSubmoduleWorktreePath` only proves containment in the parent. For a submodule
 * that is currently a plain directory git walks UP, and an unguarded write would hit the
 * PARENT's copy of a same-named path.
 */
export class GitHandlerSubmoduleOperations extends GitHandlerOperationContext {
  constructor(
    host: GitHandlerOperationHost,
    private readonly discardOps: GitHandlerDiscardOperations,
    private readonly syncOps: GitHandlerSyncOperations
  ) {
    super(host)
  }

  async list(params: Record<string, unknown>): Promise<GitSubmoduleListResult> {
    return listSubmodulesRelay(
      this.git.bind(this),
      params.worktreePath as string,
      this.submodulePathsCache
    )
  }

  private async submoduleRoot(
    params: Record<string, unknown>,
    context: RequestContext
  ): Promise<string> {
    return resolveSubmoduleRootRelay(
      (args, cwd, options) => this.git(args, cwd, { ...options, signal: context.signal }),
      params.worktreePath as string,
      params.submodulePath as string
    )
  }

  async discard(params: Record<string, unknown>, context: RequestContext) {
    const resolved = resolveSubmoduleWorktreePath(
      params.worktreePath as string,
      params.submodulePath as string
    )
    await assertSubmoduleWorktreeRoot(
      (args, cwd, options) => this.git(args, cwd, { ...options, signal: context.signal }),
      resolved
    )
    await this.discardOps.discardAtWorktree(resolved, params.filePath as string)
  }

  // `git restore` cannot put a submodule pointer back: on a moved or dirty pointer it exits 0
  // having changed nothing, and on a deleted submodule directory it clears the row while
  // leaving an empty, uninitialized directory. `--init` is what actually brings it back.
  async restorePointer(params: Record<string, unknown>) {
    this.clearGitMutationReadCaches()
    const worktreePath = params.worktreePath as string
    const submodulePath = params.submodulePath as string
    // Validates containment before the path reaches a command that writes.
    resolveSubmoduleWorktreePath(worktreePath, submodulePath)
    try {
      await this.git(
        ['submodule', 'update', '--init', '--', this.literalPathspec(submodulePath)],
        worktreePath
      )
    } finally {
      this.clearGitMutationReadCaches()
    }
  }

  async stage(params: Record<string, unknown>, context: RequestContext) {
    const root = await this.submoduleRoot(params, context)
    const filePaths = params.filePaths as string[]
    await this.runWithGitReadCacheClear(async () => {
      for (let i = 0; i < filePaths.length; i += GIT_BULK_CHUNK_SIZE) {
        const chunk = filePaths.slice(i, i + GIT_BULK_CHUNK_SIZE)
        await this.git(['add', '--', ...chunk.map((p) => this.literalPathspec(p))], root)
      }
    })
  }

  async unstage(params: Record<string, unknown>, context: RequestContext) {
    const root = await this.submoduleRoot(params, context)
    const filePaths = params.filePaths as string[]
    await this.runWithGitReadCacheClear(async () => {
      for (let i = 0; i < filePaths.length; i += GIT_BULK_CHUNK_SIZE) {
        const chunk = filePaths.slice(i, i + GIT_BULK_CHUNK_SIZE)
        await unstagePathspecsRelay(
          this.git.bind(this),
          root,
          chunk.map((p) => this.literalPathspec(p))
        )
      }
    })
  }

  async commit(
    params: Record<string, unknown>,
    context: RequestContext
  ): Promise<{ success: boolean; error?: string }> {
    let root: string
    try {
      root = await this.submoduleRoot(params, context)
    } catch (error) {
      // Why not throw: mirrors git.commit's contract — the panel renders `error` inline.
      return { success: false, error: error instanceof Error ? error.message : 'Commit failed' }
    }
    return this.runWithGitReadCacheClear(() =>
      commitChangesRelay(this.git.bind(this), root, params.message as string)
    )
  }

  async push(params: Record<string, unknown>, context: RequestContext) {
    const root = await this.submoduleRoot(params, context)
    // Why ignored: `--set-upstream` is unconditional, so first publish and re-push are one path.
    void params.publish
    await this.runWithGitReadCacheClear(async () => {
      try {
        const target = await resolveRelayPushTarget(this.git.bind(this), root, undefined)
        await this.git(
          [
            'push',
            '--set-upstream',
            ...(target ? [target.remote, target.refspec] : ['origin', 'HEAD'])
          ],
          root
        )
      } catch (error) {
        throw new Error(normalizeGitErrorMessage(error, 'push'))
      }
    })
  }

  async pull(params: Record<string, unknown>, context: RequestContext) {
    const root = await this.submoduleRoot(params, context)
    await this.syncOps.pullInWorktree(root, context.signal)
  }
}

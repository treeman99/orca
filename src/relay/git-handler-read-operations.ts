import * as path from 'node:path'
import type { RequestContext } from './dispatcher'
import { GitHandlerOperationContext } from './git-handler-operation-context'
import { getStatusOp } from './git-handler-status-ops'
import { streamRelayGitStdout } from './git-stdout-stream'
import {
  assertSubmoduleWorktreeRoot,
  computeSubmodulePointerDiff,
  findContainingSubmodule,
  listSubmodulePathsCached,
  resolveSubmoduleWorktreePath
} from './git-handler-submodule-ops'
import { computeDiff } from './git-handler-ops'
import { checkIgnoredPathsOp } from './git-handler-check-ignore'
import { loadGitHistoryFromExecutor } from '../shared/git-history'
import { stableInFlightKey } from '../shared/in-flight-promise-dedupe'

export class GitHandlerReadOperations extends GitHandlerOperationContext {
  async getStatus(params: Record<string, unknown>, context: RequestContext) {
    this.gitDiffReadDedupe.clear()
    return getStatusOp(this.git.bind(this), streamRelayGitStdout, params, {
      signal: context.signal,
      submoduleIgnorePolicyCache: this.submoduleIgnorePolicyCache
    })
  }

  // Why: fetch the submodule's own `git status`, nothing more. It used to also synthesize
  // rows for the parent's recorded gitlink -> the submodule's HEAD, which put files that are
  // already committed inside the submodule into a list the user reads as their own changes.
  // `area` is still accepted for wire compatibility and deliberately ignored — a submodule's
  // status is the same question whichever parent section its gitlink row sits in.
  async getSubmoduleStatus(params: Record<string, unknown>, context: RequestContext) {
    const worktreePath = params.worktreePath as string
    const submodulePath = params.submodulePath as string
    const resolved = resolveSubmoduleWorktreePath(worktreePath, submodulePath)
    // Why before the root probe: that probe spawns git, and an already-cancelled request must
    // reject as an abort rather than as whatever the probe happens to find.
    if (context.signal?.aborted) {
      const error = new Error('The operation was aborted.')
      error.name = 'AbortError'
      throw error
    }
    await assertSubmoduleWorktreeRoot(
      (args, cwd, options) => this.git(args, cwd, { ...options, signal: context.signal }),
      resolved
    )
    return getStatusOp(
      this.git.bind(this),
      streamRelayGitStdout,
      {
        ...params,
        worktreePath: resolved
      },
      // Why the cache: the narrowing in getStatusOp is gated on it, so leaving
      // it out skipped `submodule.<name>.ignore` for a NESTED gitlink inside an
      // expanded submodule -- over SSH only. The main process has no such gate
      // (getSubmoduleStatus routes through getStatus), so omitting it broke the
      // local/relay parity this rule is supposed to hold.
      { signal: context.signal, submoduleIgnorePolicyCache: this.submoduleIgnorePolicyCache }
    )
  }

  async checkIgnored(params: Record<string, unknown>) {
    return checkIgnoredPathsOp(this.git.bind(this), params)
  }

  async history(params: Record<string, unknown>) {
    const worktreePath = params.worktreePath as string
    return loadGitHistoryFromExecutor(this.git.bind(this), worktreePath, {
      limit: typeof params.limit === 'number' ? params.limit : undefined,
      baseRef: typeof params.baseRef === 'string' ? params.baseRef : null
    })
  }

  async getDiff(params: Record<string, unknown>, context?: RequestContext) {
    const worktreePath = params.worktreePath as string
    const filePath = params.filePath as string
    // Why: validate relative paths to prevent traversal outside the worktree.
    const resolved = path.resolve(worktreePath, filePath)
    const rel = path.relative(path.resolve(worktreePath), resolved)
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw new Error(`Path "${filePath}" resolves outside the worktree`)
    }
    const staged = params.staged as boolean
    const compareAgainstHead = params.compareAgainstHead as boolean | undefined
    // Why: register dedupe before awaiting so identical reads coalesce.
    const result = await this.gitDiffReadDedupe.run(
      stableInFlightKey(['diff', worktreePath, filePath, staged, compareAgainstHead]),
      async () => {
        // Why: route gitlink roots to pointer diffs and inner files to their submodule worktree.
        const submodulePaths = await listSubmodulePathsCached(
          this.git.bind(this),
          worktreePath,
          this.submodulePathsCache
        )
        if (submodulePaths.length > 0) {
          const matchedSubmodule = findContainingSubmodule(submodulePaths, filePath)
          if (matchedSubmodule) {
            const normalizedFilePath = filePath.replace(/\\/g, '/').replace(/\/+$/, '')
            if (normalizedFilePath === matchedSubmodule) {
              return computeSubmodulePointerDiff(
                this.git.bind(this),
                worktreePath,
                matchedSubmodule,
                staged,
                compareAgainstHead
              )
            }
            const submoduleWorktreePath = resolveSubmoduleWorktreePath(
              worktreePath,
              matchedSubmodule
            )
            const innerPath = normalizedFilePath.slice(matchedSubmodule.length + 1)
            // Why straight through: an inner row now only ever comes from the submodule's
            // own status, so its diff is the submodule's own working-tree diff.
            return computeDiff(
              this.gitBuffer.bind(this),
              submoduleWorktreePath,
              innerPath,
              staged,
              compareAgainstHead
            )
          }
        }
        return computeDiff(
          this.gitBuffer.bind(this),
          worktreePath,
          filePath,
          staged,
          compareAgainstHead
        )
      }
    )
    return this.maybeStreamResponse(result, params, context)
  }
}

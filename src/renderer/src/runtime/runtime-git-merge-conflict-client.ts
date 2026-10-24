import type { GitMergeConflictInputs } from '../../../shared/git-merge-conflict-inputs'
import { resolveLocalWorktreePath, type RuntimeGitContext } from './runtime-git-client-context'
import { callRuntimeRpc } from './runtime-rpc-client'
import { toRuntimeWorktreeSelector } from './runtime-worktree-selector'

/** `null` means the serving host predates this read; the caller rebuilds inputs from markers. */
export async function getRuntimeGitMergeConflictInputs(
  context: RuntimeGitContext,
  filePath: string
): Promise<GitMergeConflictInputs | null> {
  try {
    const target = context.target
    if (target.kind === 'local' || !context.worktreeId) {
      return await window.api.git.mergeConflictInputs({
        worktreePath: resolveLocalWorktreePath(context),
        filePath,
        connectionId: context.connectionId
      })
    }
    return await callRuntimeRpc<GitMergeConflictInputs>(
      target,
      'git.mergeConflictInputs',
      { worktree: toRuntimeWorktreeSelector(context.worktreeId), filePath },
      { timeoutMs: 15_000 }
    )
  } catch (error) {
    if (isMethodNotFound(error)) {
      return null
    }
    throw error
  }
}

// Why not only RuntimeRpcCallError: the web client's window.api reaches the same host and
// rethrows its refusal as a plain Error carrying the RPC code.
function isMethodNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'method_not_found'
  )
}

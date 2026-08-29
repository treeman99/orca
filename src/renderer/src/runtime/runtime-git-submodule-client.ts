import type { GitSubmoduleListResult } from '../../../shared/git-submodule-list'
import {
  isSubmoduleWriteUnsupportedError,
  withSubmoduleWriteSupport
} from './runtime-git-submodule-write-support'
import { callRuntimeRpc } from './runtime-rpc-client'
import { getActiveRuntimeTarget } from './runtime-client-target'
import { toRuntimeWorktreeSelector } from './runtime-worktree-selector'
import {
  resolveLocalWorktreePath,
  type RuntimeGitContext
} from './runtime-git-client-context'

/** Discard a file inside a submodule. `filePath` is relative to the SUBMODULE root. */
export async function discardRuntimeGitSubmodulePath(
  context: RuntimeGitContext,
  submodulePath: string,
  filePath: string
): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.submoduleDiscard({
      worktreePath: resolveLocalWorktreePath(context),
      submodulePath,
      filePath,
      connectionId: context.connectionId
    })
    return
  }
  await callRuntimeRpc(
    target,
    'git.submoduleDiscard',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), submodulePath, filePath },
    { timeoutMs: 15_000 }
  )
}

/** Restore a submodule pointer to the commit the parent records. Detaches its HEAD. */
export async function restoreRuntimeGitSubmodulePointer(
  context: RuntimeGitContext,
  submodulePath: string
): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.submoduleRestorePointer({
      worktreePath: resolveLocalWorktreePath(context),
      submodulePath,
      connectionId: context.connectionId
    })
    return
  }
  await callRuntimeRpc(
    target,
    'git.submoduleRestorePointer',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), submodulePath },
    // Why longer: `submodule update --init` can clone.
    { timeoutMs: 120_000 }
  )
}

/**
 * `unsupported` when the paired host predates the submodule write RPCs. Reported as a flag
 * rather than a throw because this is polled: the panel reads it to hide the per-submodule
 * write actions instead of failing every refresh.
 */
export type RuntimeGitSubmoduleListResult = GitSubmoduleListResult & { unsupported?: boolean }

export async function listRuntimeGitSubmodules(
  context: RuntimeGitContext
): Promise<RuntimeGitSubmoduleListResult> {
  const target = getActiveRuntimeTarget(context.settings)
  try {
    return await withSubmoduleWriteSupport(async () => {
      if (target.kind === 'local' || !context.worktreeId) {
        return window.api.git.submoduleList({
          worktreePath: resolveLocalWorktreePath(context),
          connectionId: context.connectionId
        })
      }
      return callRuntimeRpc<GitSubmoduleListResult>(
        target,
        'git.submoduleList',
        { worktree: toRuntimeWorktreeSelector(context.worktreeId) },
        { timeoutMs: 15_000 }
      )
    })
  } catch (error) {
    if (isSubmoduleWriteUnsupportedError(error)) {
      return { submodules: [], didHitLimit: false, unsupported: true }
    }
    throw error
  }
}

/** `filePaths` are relative to the SUBMODULE root, not the parent worktree. */
export async function stageRuntimeGitSubmodulePaths(
  context: RuntimeGitContext,
  submodulePath: string,
  filePaths: string[]
): Promise<void> {
  await runRuntimeGitSubmoduleWrite(context, 'git.submoduleStage', {
    submodulePath,
    filePaths
  })
}

/** `filePaths` are relative to the SUBMODULE root, not the parent worktree. */
export async function unstageRuntimeGitSubmodulePaths(
  context: RuntimeGitContext,
  submodulePath: string,
  filePaths: string[]
): Promise<void> {
  await runRuntimeGitSubmoduleWrite(context, 'git.submoduleUnstage', {
    submodulePath,
    filePaths
  })
}

/** Keeps the parent-repo commit contract: failure comes back as a result, not a throw. */
export async function commitRuntimeGitSubmodule(
  context: RuntimeGitContext,
  submodulePath: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const target = getActiveRuntimeTarget(context.settings)
  return withSubmoduleWriteSupport(async () => {
    if (target.kind === 'local' || !context.worktreeId) {
      return window.api.git.submoduleCommit({
        worktreePath: resolveLocalWorktreePath(context),
        submodulePath,
        message,
        connectionId: context.connectionId
      })
    }
    return callRuntimeRpc<{ success: boolean; error?: string }>(
      target,
      'git.submoduleCommit',
      { worktree: toRuntimeWorktreeSelector(context.worktreeId), submodulePath, message },
      { timeoutMs: 120_000 }
    )
  })
}

/** `publish` sets upstream on a submodule branch that has none yet. */
export async function pushRuntimeGitSubmodule(
  context: RuntimeGitContext,
  submodulePath: string,
  publish = false
): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  await withSubmoduleWriteSupport(async () => {
    if (target.kind === 'local' || !context.worktreeId) {
      await window.api.git.submodulePush({
        worktreePath: resolveLocalWorktreePath(context),
        submodulePath,
        publish,
        connectionId: context.connectionId
      })
      return
    }
    await callRuntimeRpc(
      target,
      'git.submodulePush',
      { worktree: toRuntimeWorktreeSelector(context.worktreeId), submodulePath, publish },
      // Why longer: a push contacts the remote.
      { timeoutMs: 300_000 }
    )
  })
}

/** Pull the submodule's own branch. Sync Changes runs this BEFORE the push. */
export async function pullRuntimeGitSubmodule(
  context: RuntimeGitContext,
  submodulePath: string
): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  await withSubmoduleWriteSupport(async () => {
    if (target.kind === 'local' || !context.worktreeId) {
      await window.api.git.submodulePull({
        worktreePath: resolveLocalWorktreePath(context),
        submodulePath,
        connectionId: context.connectionId
      })
      return
    }
    await callRuntimeRpc(
      target,
      'git.submodulePull',
      { worktree: toRuntimeWorktreeSelector(context.worktreeId), submodulePath },
      // Why longer: a pull contacts the remote.
      { timeoutMs: 300_000 }
    )
  })
}

async function runRuntimeGitSubmoduleWrite(
  context: RuntimeGitContext,
  method: 'git.submoduleStage' | 'git.submoduleUnstage',
  args: { submodulePath: string; filePaths: string[] }
): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  await withSubmoduleWriteSupport(async () => {
    if (target.kind === 'local' || !context.worktreeId) {
      const invoke =
        method === 'git.submoduleStage'
          ? window.api.git.submoduleStage
          : window.api.git.submoduleUnstage
      await invoke({
        worktreePath: resolveLocalWorktreePath(context),
        submodulePath: args.submodulePath,
        filePaths: args.filePaths,
        connectionId: context.connectionId
      })
      return
    }
    await callRuntimeRpc(
      target,
      method,
      { worktree: toRuntimeWorktreeSelector(context.worktreeId), ...args },
      { timeoutMs: 15_000 }
    )
  })
}

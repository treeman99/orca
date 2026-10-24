import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import { getConnectionIdForFile } from '@/lib/connection-context'
import { requireRuntimeTargetForFileOwner } from '@/lib/file-owner-runtime-target'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import { getRuntimeGitMergeConflictInputs } from '@/runtime/runtime-git-merge-conflict-client'
import { refreshGitStatusForWorktree } from '@/components/right-sidebar/git-status-refresh'
import type { GitMergeConflictInputs } from '../../../../../shared/git-merge-conflict-inputs'

/** Same routing as the editor's diff loader: the file owner's host, its SSH connection, its root. */
export function mergeEditorGitContext(
  file: Pick<OpenFile, 'worktreeId' | 'filePath' | 'relativePath' | 'runtimeEnvironmentId'>
): RuntimeGitContext {
  return {
    target: requireRuntimeTargetForFileOwner(
      useAppStore.getState(),
      file.worktreeId,
      file.runtimeEnvironmentId
    ),
    worktreeId: file.worktreeId,
    worktreePath: file.filePath.slice(0, file.filePath.length - file.relativePath.length - 1),
    connectionId: getConnectionIdForFile(file.worktreeId, file.filePath) ?? undefined
  }
}

/** Null when the host predates the read or the read failed; the caller falls back to markers (D5). */
export async function readMergeConflictInputs(
  file: Pick<OpenFile, 'worktreeId' | 'filePath' | 'relativePath' | 'runtimeEnvironmentId'>
): Promise<GitMergeConflictInputs | null> {
  try {
    return await getRuntimeGitMergeConflictInputs(mergeEditorGitContext(file), file.relativePath)
  } catch (error) {
    console.warn('[merge-editor] reading the conflict stages failed; using the markers', error)
    return null
  }
}

export async function refreshMergedFileStatus(context: RuntimeGitContext): Promise<void> {
  const state = useAppStore.getState()
  if (!context.worktreeId) {
    return
  }
  await refreshGitStatusForWorktree({
    target: context.target,
    worktreeId: context.worktreeId,
    worktreePath: context.worktreePath,
    connectionId: context.connectionId,
    pushTarget: findWorktreeById(state.worktreesByRepo, context.worktreeId)?.pushTarget,
    deps: {
      setGitStatus: state.setGitStatus,
      updateWorktreeGitIdentity: state.updateWorktreeGitIdentity,
      setUpstreamStatus: state.setUpstreamStatus,
      fetchUpstreamStatus: state.fetchUpstreamStatus
    },
    request: { admissionTier: 'interactive' }
  })
}

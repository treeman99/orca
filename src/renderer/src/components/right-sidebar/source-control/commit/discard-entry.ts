import { getConnectionId } from '@/lib/connection-context'
import {
  discardRuntimeGitSubmodulePath,
  restoreRuntimeGitSubmodulePointer
} from '@/runtime/runtime-git-submodule-client'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'
import { requireGitOwnerTarget } from '../../worktree-git-owner-target'
import {
  notifyEditorExternalFileChange,
  requestEditorSaveQuiesce
} from '@/components/editor/editor-autosave'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import { isSubmoduleGitlinkRow } from '../../source-control-submodule-gitlink-row'
import { resolveSubmoduleDiscardTarget } from '../../source-control-submodule-discard-target'

/**
 * Per-row discard, routed by what the row actually is.
 *
 * Three different git operations wear one button here. A file inside a submodule has to be
 * restored by the SUBMODULE's repository — the parent has no index entry for it — while the
 * gitlink row itself is a recorded pointer that only `git submodule update` can put back.
 * The editor calls keep the PARENT-relative path either way: that is what the editor has
 * the file open as, and handing them the submodule-relative one quiesces the wrong buffer.
 */
export async function discardSourceControlEntry({
  entry,
  activeRepoTarget,
  activeWorktreeId,
  worktreePath,
  discardSingle,
  refreshSubmodule
}: {
  entry: GitStatusEntry
  activeRepoTarget: RuntimeClientTarget | null
  activeWorktreeId: string | null
  worktreePath: string | null
  discardSingle: (path: string) => Promise<void>
  refreshSubmodule: (submodulePath: string) => void
}): Promise<void> {
  if (!worktreePath || !activeWorktreeId) {
    return
  }
  const submoduleTarget = resolveSubmoduleDiscardTarget(entry)
  if (!submoduleTarget && !isSubmoduleGitlinkRow(entry)) {
    await discardSingle(entry.path)
    return
  }
  // Why the owner's id: the editor holds the file under the host that owns the repo, not the focused one.
  const runtimeEnvironmentId =
    activeRepoTarget?.kind === 'environment' ? activeRepoTarget.environmentId : null
  await requestEditorSaveQuiesce({
    worktreeId: activeWorktreeId,
    worktreePath,
    relativePath: entry.path,
    runtimeEnvironmentId
  })
  const context = {
    // Why: route by the repo OWNER host, not the focused runtime.
    target: requireGitOwnerTarget(activeRepoTarget),
    worktreeId: activeWorktreeId,
    worktreePath,
    connectionId: getConnectionId(activeWorktreeId) ?? undefined
  }
  await (submoduleTarget
    ? discardRuntimeGitSubmodulePath(
        context,
        submoduleTarget.submodulePath,
        submoduleTarget.innerPath
      )
    : restoreRuntimeGitSubmodulePointer(context, entry.path))
  notifyEditorExternalFileChange({
    worktreeId: activeWorktreeId,
    worktreePath,
    relativePath: entry.path,
    runtimeEnvironmentId
  })
  if (submoduleTarget) {
    refreshSubmodule(submoduleTarget.submodulePath)
  }
}

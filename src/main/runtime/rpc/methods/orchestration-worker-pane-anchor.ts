// Whether a dispatched worker may open in a column beside its coordinator, and why not.
//
// Lifted out of orchestration-workers.ts because that file sits at the max-lines cap and this
// decision needs a comparison the inline ternary got wrong for a release.

import { runtimeWorktreeIdsEqual } from '../../runtime-worktree-path-identity'
import type { WorkerEffect } from './orchestration-worker-topology'

export type WorkerPaneAnchor = { coordinatorWorktreeId: string } & (
  | { coordinatorTabId: string }
  | { paneAnchorSkipped: NonNullable<WorkerEffect['paneAnchorSkipped']> }
)

/**
 * A worker column can only be drawn next to the coordinator when both panes live in the same
 * workspace surface — tab-group layouts are per worktree. The skip reason rides along so a
 * worker that lands as a tab in the coordinator's group can be told apart from the preference
 * being off.
 *
 * Why normalized and not `!==`: showManagedTerminalWorkspace matched the coordinator's worktree
 * by comparison key (#16243), so a PTY whose id differs only in path spelling — drive-letter
 * case, separators, a WSL UNC alias — resolves to the same row under another id. Byte-comparing
 * that pair dropped the anchor precisely where spellings vary (Windows), and the worker fell
 * into the coordinator's group as a plain tab, indistinguishable from the preference being off.
 */
export function resolveWorkerPaneAnchor(
  coordinatorTabId: string | undefined,
  coordinator: { worktreeId: string },
  worker: { id: string }
): WorkerPaneAnchor {
  const coordinatorWorktreeId = coordinator.worktreeId
  if (!coordinatorTabId) {
    return { paneAnchorSkipped: 'coordinator-pane-unresolved', coordinatorWorktreeId }
  }
  if (!runtimeWorktreeIdsEqual(worker.id, coordinatorWorktreeId)) {
    return { paneAnchorSkipped: 'worker-worktree-differs', coordinatorWorktreeId }
  }
  return { coordinatorTabId, coordinatorWorktreeId }
}

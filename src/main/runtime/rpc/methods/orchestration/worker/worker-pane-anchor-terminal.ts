// The three pieces the fork's worker-column anchor adds to a worker terminal creation.
//
// Lifted out of worker-topology.ts because that file sits at the max-lines cap and upstream
// keeps splitting it; a fork hunk inlined there is what disappears on the next sync.

import type { TuiAgent } from '../../../../../../shared/tui-agent'
import { writeDiagnosticLine } from '../../../../../observability/diagnostic-log'

/** Why no worker column was requested. Without this a worker that lands as a tab in the
 *  coordinator's group looks identical to the auto-split preference being off. */
export type WorkerPaneAnchorSkipReason =
  | 'coordinator-pane-unresolved'
  | 'worker-worktree-differs'
  | 'new-worktree'

/** The dispatch-effect fields the anchor contributes. */
export type WorkerPaneAnchorFields = {
  /** Coordinator tab the renderer may anchor a worker column to. */
  paneAnchorTabId?: string
  paneAnchorSkipped?: WorkerPaneAnchorSkipReason
}

/** Where a dispatched worker's column may open, and why it may not. */
export type WorkerPaneAnchorInput = {
  /** Coordinator tab the renderer may anchor a worker column to. Same-worktree dispatches only. */
  coordinatorTabId?: string
  /** Set when no anchor is passed, so the omission is visible in the dispatch effects. */
  paneAnchorSkipped?: WorkerPaneAnchorSkipReason
  /** The coordinator PTY's own worktree id, logged next to the worker's when the anchor is skipped. */
  coordinatorWorktreeId?: string
}

export function workerPanePlacement(
  anchor: WorkerPaneAnchorInput
): { paneGroupPlacement: { kind: 'orchestration-worker'; coordinatorTabId: string } } | object {
  return anchor.coordinatorTabId
    ? {
        paneGroupPlacement: {
          kind: 'orchestration-worker' as const,
          coordinatorTabId: anchor.coordinatorTabId
        }
      }
    : {}
}

/** Records the anchor decision and returns the created-terminal effect carrying it. */
export function workerPaneAnchorEffect(
  anchor: WorkerPaneAnchorInput,
  context: { taskId: string; agent: TuiAgent; worktreeId: string },
  terminal: { handle: string; surface?: 'visible' | 'background'; warning?: string }
): {
  kind: 'terminal'
  role: string
  action: string
  id: string
  surface?: 'visible' | 'background'
  warning?: string
} & WorkerPaneAnchorFields {
  writeDiagnosticLine('worker-pane-main', {
    task: context.taskId,
    agent: context.agent,
    anchor: anchor.coordinatorTabId ?? 'none',
    skip: anchor.paneAnchorSkipped ?? 'none',
    surface: terminal.surface,
    // Why both ids on a skip: `worker-worktree-differs` on a same-worktree dispatch is a
    // spelling disagreement, and only the two spellings side by side say so.
    ...(anchor.paneAnchorSkipped
      ? { workerWt: context.worktreeId, coordWt: anchor.coordinatorWorktreeId ?? 'none' }
      : {})
  })
  return {
    kind: 'terminal',
    role: 'agent',
    action: 'created',
    id: terminal.handle,
    surface: terminal.surface,
    warning: terminal.warning,
    ...(anchor.coordinatorTabId
      ? { paneAnchorTabId: anchor.coordinatorTabId }
      : anchor.paneAnchorSkipped
        ? { paneAnchorSkipped: anchor.paneAnchorSkipped }
        : {})
  }
}

/**
 * Where a runtime-created terminal should land in the renderer's tab-group
 * layout. Without a hint the renderer drops the tab into the worktree's active
 * group, which is why orchestration workers used to pile up on the coordinator.
 */
export type TerminalPaneGroupPlacement = {
  kind: 'orchestration-worker'
  /** Host tab id of the coordinator terminal that dispatched this worker. */
  coordinatorTabId: string
}

/** The worker column stops splitting here; further workers become tabs spread across these panes. */
export const ORCHESTRATION_WORKER_PANE_MAX_GROUPS = 4

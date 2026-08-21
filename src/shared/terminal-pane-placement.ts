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

/** Auto-split worker columns beyond this many stack the newest worker as a tab instead. */
export const ORCHESTRATION_WORKER_PANE_MAX_GROUPS = 3

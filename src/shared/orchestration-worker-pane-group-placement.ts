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

/** Selectable worker-column heights, shortest first — the settings control renders these in order. */
export const ORCHESTRATION_WORKER_PANE_MAX_GROUP_CHOICES = [1, 2, 3, 4, 5, 6] as const

/** Where the column stops splitting unless the user picked otherwise. */
export const DEFAULT_ORCHESTRATION_WORKER_PANE_MAX_GROUPS = 4

/**
 * Why clamp instead of trusting the stored value: settings are user-editable
 * JSON that also outlives the choice list, and a 0 or a 1e9 would strand every
 * dispatched worker in one pane or split the column into unreadable slivers.
 */
export function resolveOrchestrationWorkerPaneMaxGroups(configured: number | undefined): number {
  if (typeof configured !== 'number' || !Number.isFinite(configured)) {
    return DEFAULT_ORCHESTRATION_WORKER_PANE_MAX_GROUPS
  }
  const shortest = ORCHESTRATION_WORKER_PANE_MAX_GROUP_CHOICES[0]
  const tallest = ORCHESTRATION_WORKER_PANE_MAX_GROUP_CHOICES.at(-1) ?? shortest
  return Math.min(tallest, Math.max(shortest, Math.round(configured)))
}

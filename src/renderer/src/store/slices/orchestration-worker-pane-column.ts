import type { Tab, TabGroup, TabGroupLayoutNode } from '../../../../shared/tab-types'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { TerminalPaneGroupPlacement } from '../../../../shared/terminal-pane-placement'
import type { TabSplitDirection } from './tabs'
import {
  buildWorkerStackRatioUpdates,
  resolveOrchestrationWorkerPanePlacement,
  type WorkerPaneGroup
} from './orchestration-worker-pane-layout'

/**
 * Session-scoped bookkeeping for the auto-split worker column. Worker *tab* ids
 * are recorded rather than group ids so the column follows the tabs when the
 * user drags one elsewhere or a group collapses.
 */
const workerTabIdsByCoordinatorTabId = new Map<string, string[]>()
// Why capped: entries outlive their coordinator (a closed tab never notifies us),
// and the map is only ever read for the newest dispatches.
const MAX_TRACKED_COORDINATORS = 64

export function _resetOrchestrationWorkerPaneColumnForTests(): void {
  workerTabIdsByCoordinatorTabId.clear()
}

type WorkerPaneColumnState = {
  settings: GlobalSettings | null
  unifiedTabsByWorktree: Record<string, Tab[]>
  groupsByWorktree: Record<string, TabGroup[]>
  layoutByWorktree: Record<string, TabGroupLayoutNode>
  createEmptySplitGroup: (
    worktreeId: string,
    sourceGroupId: string,
    direction: TabSplitDirection,
    opts?: { activate?: boolean; recordInteraction?: boolean }
  ) => string | null
  setTabGroupSplitRatio: (worktreeId: string, nodePath: string, ratio: number) => void
}

function findTerminalTab(tabs: readonly Tab[], tabId: string): Tab | undefined {
  return tabs.find(
    (tab) => tab.contentType === 'terminal' && (tab.id === tabId || tab.entityId === tabId)
  )
}

function resolveLiveWorkerGroups(
  state: WorkerPaneColumnState,
  worktreeId: string,
  coordinatorTabId: string,
  coordinatorGroupId: string
): WorkerPaneGroup[] {
  const tabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  const liveGroupIds = new Set((state.groupsByWorktree[worktreeId] ?? []).map((group) => group.id))
  const trackedTabIds = workerTabIdsByCoordinatorTabId.get(coordinatorTabId) ?? []
  const survivingTabIds: string[] = []
  const groups: WorkerPaneGroup[] = []
  for (const workerTabId of trackedTabIds) {
    const tab = findTerminalTab(tabs, workerTabId)
    if (!tab) {
      continue
    }
    survivingTabIds.push(workerTabId)
    if (tab.groupId === coordinatorGroupId || !liveGroupIds.has(tab.groupId)) {
      continue
    }
    // Why only tracked workers count: a terminal the user dragged into a worker
    // pane is not our load, and letting it skew the balance strands that pane.
    const existing = groups.find((group) => group.groupId === tab.groupId)
    if (existing) {
      existing.workerTabCount += 1
      continue
    }
    groups.push({ groupId: tab.groupId, workerTabCount: 1 })
  }
  if (survivingTabIds.length !== trackedTabIds.length) {
    workerTabIdsByCoordinatorTabId.set(coordinatorTabId, survivingTabIds)
  }
  return groups
}

/**
 * Resolve — creating one when needed — the tab group a dispatched orchestration
 * worker should open in. Returns undefined whenever the layout must be left
 * alone: preference off, unknown coordinator, or a coordinator in another
 * worktree (tab-group layouts are per worktree, so no split can show both).
 */
export function claimOrchestrationWorkerPaneGroup(
  store: { getState: () => WorkerPaneColumnState },
  args: { worktreeId: string; paneGroupPlacement: TerminalPaneGroupPlacement }
): string | undefined {
  const state = store.getState()
  if (state.settings?.autoSplitOrchestrationWorkerPanes !== true) {
    return undefined
  }
  const { coordinatorTabId } = args.paneGroupPlacement
  const coordinatorTab = findTerminalTab(
    state.unifiedTabsByWorktree[args.worktreeId] ?? [],
    coordinatorTabId
  )
  if (!coordinatorTab) {
    return undefined
  }
  const workerGroups = resolveLiveWorkerGroups(
    state,
    args.worktreeId,
    coordinatorTabId,
    coordinatorTab.groupId
  )
  const placement = resolveOrchestrationWorkerPanePlacement({
    coordinatorGroupId: coordinatorTab.groupId,
    workerGroups
  })
  if (placement.kind === 'existing-group') {
    return placement.groupId
  }
  const createdGroupId = state.createEmptySplitGroup(
    args.worktreeId,
    placement.sourceGroupId,
    placement.direction,
    // Why: a dispatched worker is background work — it must not move focus, and
    // an automatic split is not the user discovering the panes feature.
    { activate: false, recordInteraction: false }
  )
  if (!createdGroupId) {
    return undefined
  }
  for (const update of buildWorkerStackRatioUpdates(
    store.getState().layoutByWorktree[args.worktreeId],
    [...workerGroups.map((group) => group.groupId), createdGroupId]
  )) {
    state.setTabGroupSplitRatio(args.worktreeId, update.nodePath, update.ratio)
  }
  return createdGroupId
}

export function recordOrchestrationWorkerTab(coordinatorTabId: string, workerTabId: string): void {
  const tracked = workerTabIdsByCoordinatorTabId.get(coordinatorTabId) ?? []
  if (tracked.includes(workerTabId)) {
    return
  }
  workerTabIdsByCoordinatorTabId.delete(coordinatorTabId)
  workerTabIdsByCoordinatorTabId.set(coordinatorTabId, [...tracked, workerTabId])
  while (workerTabIdsByCoordinatorTabId.size > MAX_TRACKED_COORDINATORS) {
    const oldest = workerTabIdsByCoordinatorTabId.keys().next()
    if (oldest.done) {
      break
    }
    workerTabIdsByCoordinatorTabId.delete(oldest.value)
  }
}

import type { TabGroupLayoutNode } from '../../../../shared/tab-types'
import { ORCHESTRATION_WORKER_PANE_MAX_GROUPS } from '../../../../shared/terminal-pane-placement'

/**
 * Pure layout math for the orchestration worker column: the coordinator keeps
 * the left pane, dispatched workers stack down a column split off its right.
 * Nothing here touches the store, so both the decision and the ratio spine can
 * be asserted without a live layout.
 */
export type WorkerPanePlacement =
  | { kind: 'split'; sourceGroupId: string; direction: 'right' | 'down' }
  | { kind: 'existing-group'; groupId: string }

export function resolveOrchestrationWorkerPanePlacement(args: {
  coordinatorGroupId: string
  /** Live worker groups in dispatch order, coordinator group already excluded. */
  workerGroupIds: readonly string[]
  maxGroups?: number
}): WorkerPanePlacement {
  const maxGroups = args.maxGroups ?? ORCHESTRATION_WORKER_PANE_MAX_GROUPS
  const lastWorkerGroupId = args.workerGroupIds.at(-1)
  if (!lastWorkerGroupId) {
    return { kind: 'split', sourceGroupId: args.coordinatorGroupId, direction: 'right' }
  }
  // Why capped: every extra row shrinks the whole column, and an agent TUI below
  // ~20 rows reflows into an unreadable pane. Past the cap workers become tabs.
  if (args.workerGroupIds.length >= Math.max(1, maxGroups)) {
    return { kind: 'existing-group', groupId: lastWorkerGroupId }
  }
  return { kind: 'split', sourceGroupId: lastWorkerGroupId, direction: 'down' }
}

/** Finds the vertical split whose top pane is `groupId` — one rung of the worker stack. */
function findNodePathWithFirstLeaf(
  node: TabGroupLayoutNode | undefined,
  groupId: string,
  path: string[] = []
): string[] | null {
  if (!node || node.type !== 'split') {
    return null
  }
  if (
    node.direction === 'vertical' &&
    node.first.type === 'leaf' &&
    node.first.groupId === groupId
  ) {
    return path
  }
  return (
    findNodePathWithFirstLeaf(node.first, groupId, [...path, 'first']) ??
    findNodePathWithFirstLeaf(node.second, groupId, [...path, 'second'])
  )
}

function nodeAtPath(
  node: TabGroupLayoutNode | undefined,
  path: readonly string[]
): TabGroupLayoutNode | undefined {
  let current = node
  for (const segment of path) {
    if (!current || current.type !== 'split' || (segment !== 'first' && segment !== 'second')) {
      return undefined
    }
    current = current[segment]
  }
  return current
}

/**
 * Ratios that make an N-row worker column even. Splits are binary and always
 * ratio 0.5, so three workers would otherwise render 1/2, 1/4, 1/4.
 *
 * Returns nothing when the spine no longer matches (the user rearranged the
 * panes) — an automatic layout must never fight a manual one.
 */
export function buildWorkerStackRatioUpdates(
  layout: TabGroupLayoutNode | undefined,
  orderedWorkerGroupIds: readonly string[]
): { nodePath: string; ratio: number }[] {
  const updates: { nodePath: string; ratio: number }[] = []
  let subtreePath: string[] | null = []
  for (let index = 0; index + 1 < orderedWorkerGroupIds.length; index += 1) {
    if (!subtreePath) {
      break
    }
    const subtree = nodeAtPath(layout, subtreePath)
    const relativePath = findNodePathWithFirstLeaf(subtree, orderedWorkerGroupIds[index])
    if (!relativePath) {
      break
    }
    const nodePath = [...subtreePath, ...relativePath]
    updates.push({
      nodePath: nodePath.join('.'),
      ratio: 1 / (orderedWorkerGroupIds.length - index)
    })
    subtreePath = [...nodePath, 'second']
  }
  return updates
}

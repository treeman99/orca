import type { AppState } from '@/store/types'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { parsePaneKey } from '../../../../shared/stable-pane-id'

export type LiveEntriesByWorktreeCache = {
  tabsByWorktree: AppState['tabsByWorktree']
  unifiedTabsByWorktree: AppState['unifiedTabsByWorktree'] | undefined
  agentStatusByPaneKey: AppState['agentStatusByPaneKey']
  entriesByWorktree: Map<string, AgentStatusEntry[]>
}

// Why: test-only observability — proves same-key entry updates (per-ping
// setAgentStatus map churn) take the O(changed) patch path, not a full rebuild.
let liveEntriesFullRebuildCount = 0
export function getLiveEntriesFullRebuildCountForTests(): number {
  return liveEntriesFullRebuildCount
}
export function recordLiveEntriesFullRebuild(): void {
  liveEntriesFullRebuildCount += 1
}

const NO_WORKTREES: readonly string[] = Object.freeze([])

/**
 * Every worktree card that must show this live row.
 *
 * Why a union rather than one destination: an orchestration worker's pane lives in the
 * COORDINATOR's tab (the worker-pane auto-split puts it there) while the worker itself is
 * attributed to the workspace it works in. Preferring one meant the row sat on exactly one
 * card, and which one flipped with tab membership — `tabs-hydration` drops a worktree's
 * bucket once it is empty, so switching projects was enough to move a running worker's row
 * to the other card. From the sidebar that reads as the row vanishing while the pane keeps
 * running. The orchestration context index already unions the same way, by the same
 * argument (`worktree-agent-orchestration-index.ts`).
 *
 * Kept from the old rule: a completed row whose tab is gone belongs to no card (#6584), and
 * a row whose tab and attribution agree — every non-orchestration agent — still yields one.
 */
export function liveEntryWorktreeIds(
  paneKey: string,
  entry: AgentStatusEntry,
  tabIdToWorktreeId: Map<string, string>
): readonly string[] {
  const parsed = parsePaneKey(paneKey)
  if (!parsed) {
    return NO_WORKTREES
  }
  const tabWorktreeId = tabIdToWorktreeId.get(parsed.tabId)
  const attributedWorktreeId = entry.state === 'done' ? undefined : entry.worktreeId
  if (tabWorktreeId && attributedWorktreeId && tabWorktreeId !== attributedWorktreeId) {
    return [tabWorktreeId, attributedWorktreeId]
  }
  const only = tabWorktreeId ?? attributedWorktreeId
  return only ? [only] : NO_WORKTREES
}

/**
 * Patches the cached by-worktree index in place of a full rebuild when the
 * live map changed only by replacing entries under existing pane keys with
 * the same bucketing (worktree attribution and done-ness).
 *
 * Why: setAgentStatus mints a new agentStatusByPaneKey on EVERY status ping,
 * including same-state working prompt/tool updates. Rebuilding the whole
 * index (parsePaneKey + bucketing across all live agents) per ping is the
 * dominant selector cost under parallel agents; a within-state ping only
 * needs the owning worktree's bucket refreshed.
 *
 * Invariant this relies on: no map producer reorders existing pane keys
 * without also changing an entry reference or the key set. All current
 * writers hold this (updates spread-overwrite in place; the only reorderer,
 * movePaneKeyedRecord, deletes+re-adds so the new key trips the added-key
 * bail). A future producer that rebuilt the map in a new key order with
 * identical entry refs would need to invalidate this cache instead.
 */
export function patchLiveEntriesByWorktree(
  cache: LiveEntriesByWorktreeCache,
  agentStatusByPaneKey: AppState['agentStatusByPaneKey'],
  tabIdToWorktreeId: Map<string, string>
): Map<string, AgentStatusEntry[]> | null {
  const previousMap = cache.agentStatusByPaneKey
  const changed: { paneKey: string; entry: AgentStatusEntry }[] = []
  let keyCount = 0
  for (const paneKey in agentStatusByPaneKey) {
    keyCount += 1
    const entry = agentStatusByPaneKey[paneKey]
    const previous = previousMap[paneKey]
    if (previous === entry) {
      continue
    }
    // Why: bail on added keys or bucket-determinant changes — the bucket rule
    // depends only on paneKey, the (reference-equal) tab index, worktree
    // attribution, and done-ness, so equal determinants mean the same bucket.
    if (
      previous === undefined ||
      previous.worktreeId !== entry.worktreeId ||
      (previous.state === 'done') !== (entry.state === 'done')
    ) {
      return null
    }
    changed.push({ paneKey, entry })
  }
  if (keyCount !== Object.keys(previousMap).length) {
    // Why: removed keys need buckets dropped; leave that to the full rebuild.
    return null
  }
  if (changed.length === 0) {
    return cache.entriesByWorktree
  }

  const entriesByWorktree = new Map(cache.entriesByWorktree)
  const clonedBuckets = new Set<string>()
  for (const { paneKey, entry } of changed) {
    // Why every bucket and not the first: a cross-worktree row sits in two, and refreshing
    // only one would leave the other card rendering the previous entry forever.
    for (const worktreeId of liveEntryWorktreeIds(paneKey, entry, tabIdToWorktreeId)) {
      const bucket = entriesByWorktree.get(worktreeId)
      const index = bucket?.indexOf(previousMap[paneKey]) ?? -1
      if (!bucket || index < 0) {
        return null
      }
      const nextBucket = clonedBuckets.has(worktreeId) ? bucket : bucket.slice()
      // Why: in-position replacement preserves iteration order, matching what a
      // full rebuild would produce (spread updates keep object insertion order).
      nextBucket[index] = entry
      if (!clonedBuckets.has(worktreeId)) {
        clonedBuckets.add(worktreeId)
        entriesByWorktree.set(worktreeId, nextBucket)
      }
    }
  }
  return entriesByWorktree
}

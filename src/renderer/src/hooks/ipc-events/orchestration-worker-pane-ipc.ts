// Fork-owned: the worker-column half of onCreateTerminal. Lifted out of
// terminal-presentation-ipc-bridge.ts, which upstream keeps at its max-lines cap, so the bridge
// carries one claim line and one finish line instead of the whole placement.
import type { TerminalPaneGroupPlacement } from '../../../../shared/orchestration-worker-pane-group-placement'
import { useAppStore } from '../../store'
import {
  claimOrchestrationWorkerPaneGroup,
  placeOrchestrationWorkerTabInGroup,
  recordOrchestrationWorkerTab
} from '@/store/slices/orchestration-worker-pane-column'

export type WorkerPaneClaim = {
  /** The worker column's group, or undefined to keep upstream's active-group placement. */
  groupId: string | undefined
  /** Moves a reused tab into the column, records it for the coordinator, and logs the outcome. */
  finish: (tab: { id: string }, launchAgent: string | undefined) => void
}

export function claimWorkerPane(
  worktreeId: string,
  paneGroupPlacement: TerminalPaneGroupPlacement | undefined,
  isSplitReveal: boolean,
  reusedTab: { id: string } | null | undefined
): WorkerPaneClaim {
  // Why: an orchestration worker opens beside its coordinator instead of in the active group.
  // Undefined (preference off, foreign worktree) keeps the old path. A reused tab still claims:
  // another path (host graph sweep, stable-pane reattach) may have minted it into the active
  // group moments earlier, and the column is owed either way — it is moved in finish().
  let skip: string = isSplitReveal ? 'split-reveal' : 'none'
  const groupId =
    paneGroupPlacement && !isSplitReveal
      ? claimOrchestrationWorkerPaneGroup(useAppStore, {
          worktreeId,
          paneGroupPlacement,
          ...(reusedTab ? { existingWorkerTabId: reusedTab.id } : {}),
          onSkip: (reason) => {
            skip = reason
          }
        })
      : undefined
  return {
    groupId,
    finish: (tab, launchAgent) => {
      if (groupId && paneGroupPlacement) {
        if (reusedTab) {
          // createTab could not place a tab that already existed; move it instead.
          placeOrchestrationWorkerTabInGroup(useAppStore, {
            worktreeId,
            terminalTabId: tab.id,
            groupId
          })
        }
        recordOrchestrationWorkerTab(paneGroupPlacement.coordinatorTabId, tab.id)
      }
      if (paneGroupPlacement) {
        void window.api.diagnosticLog?.write('worker-pane-renderer', {
          agent: launchAgent ?? 'none',
          coord: paneGroupPlacement.coordinatorTabId,
          tab: tab.id,
          group: groupId ?? 'none',
          skip
        })
      }
    }
  }
}

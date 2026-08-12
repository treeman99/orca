import { buildHostIdByWorktreeId } from '@/lib/workspace-session-host-persistence'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../../../shared/execution-host'
import type { AppState } from '../types'

/**
 * Tell the host a tab-close click happened, so the deletion becomes durable.
 *
 * Terminal membership lives with the host: `rebaseWorkspaceSessionTerminalMembership`
 * rebuilds it from the host's own copy whenever a repo's topology fence is armed, so a
 * renderer patch that merely omits the tab is discarded. Until now the only thing that
 * actually deleted a tab was a PTY exit the host could match to a live pane — which a
 * restored-but-never-attached tab has none of, so closing it looked fine until the next
 * launch brought it back. This closes that gap for the deliberate click.
 */
export function retireClosedTerminalTabOnHost(
  state: Pick<
    AppState,
    | 'repos'
    | 'projectGroups'
    | 'folderWorkspaces'
    | 'worktreesByRepo'
    | 'restoredRuntimeHostIdByWorkspaceSessionKey'
  >,
  closure: { worktreeId: string; tabId: string }
): void {
  // Why: `typeof`, not `window.api?.` — closeTab also runs where there is no `window`
  // binding at all (node-environment slice tests), and a bare reference throws there.
  const retire =
    typeof window === 'undefined' ? undefined : window.api?.session?.retireClosedTerminalTabs
  if (!retire) {
    return
  }
  let hostId: ExecutionHostId = LOCAL_EXECUTION_HOST_ID
  try {
    hostId = buildHostIdByWorktreeId(state)(closure.worktreeId)
  } catch {
    // Why: an unmapped worktree still owns a real tab; the local partition is where
    // every unrouted entry is persisted, so retiring there beats not retiring at all.
  }
  // Why: fire-and-forget with a logged failure — a close must stay synchronous and must
  // never reject into the UI. A lost retirement is the pre-existing behaviour, not worse.
  void Promise.resolve(retire({ closures: [closure] }, hostId)).catch((error: unknown) => {
    console.warn('[terminal-retirement] host retirement failed', {
      tabId: closure.tabId,
      error: error instanceof Error ? error.message : String(error)
    })
  })
}

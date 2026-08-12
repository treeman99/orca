import type { WorkspaceSessionState } from '../../shared/types'
import { retireTerminalSurfaceFromPersistence } from './mobile-session-terminal-persistence-retirement'

function persistsTerminalTab(
  session: WorkspaceSessionState,
  worktreeId: string,
  tabId: string
): boolean {
  return (
    (session.tabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === tabId) ||
    (session.unifiedTabs?.[worktreeId] ?? []).some(
      (tab) => tab.id === tabId || tab.entityId === tabId
    ) ||
    session.terminalLayoutsByTabId[tabId] !== undefined
  )
}

/**
 * Apply the user's tab-close clicks to the host's own copy of the session.
 *
 * The host owns terminal membership: renderer writes are rebased onto it, so a close
 * that only removes the tab in the renderer is reverted on the next patch and the tab
 * comes back at launch. Routing the click here removes it from the durable copy and
 * advances the fence, which is what makes the deletion stick.
 */
export function retireClosedTerminalTabsFromPersistence(
  session: WorkspaceSessionState,
  closures: readonly { worktreeId: string; tabId: string }[]
): WorkspaceSessionState {
  let next = session
  for (const closure of closures) {
    // Why: a close for a tab the host no longer persists is a no-op, and letting it
    // through would advance the fence and force a disk write on every stray click.
    if (!persistsTerminalTab(next, closure.worktreeId, closure.tabId)) {
      continue
    }
    const layout = next.terminalLayoutsByTabId[closure.tabId]
    const leafId = layout?.activeLeafId ?? ''
    next = retireTerminalSurfaceFromPersistence(
      next,
      {
        worktreeId: closure.worktreeId,
        parentTabId: closure.tabId,
        leafId,
        ptyId: layout?.ptyIdsByLeafId?.[leafId] ?? ''
      },
      { closedByUser: true }
    )
  }
  return next
}

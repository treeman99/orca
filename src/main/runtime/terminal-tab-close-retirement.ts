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
 * Every PTY the host still records for a tab, across all of its split panes.
 *
 * The renderer only knows the PTYs it attached this run; a tab restored from the last
 * session and never revealed has none, while the daemon is still holding its processes.
 * Reading the durable layout is what makes a close reach those.
 */
export function collectPersistedTerminalTabPtyIds(
  session: WorkspaceSessionState,
  worktreeId: string,
  tabId: string
): string[] {
  const ptyIds = new Set<string>()
  for (const ptyId of Object.values(session.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId ?? {})) {
    if (typeof ptyId === 'string' && ptyId.length > 0) {
      ptyIds.add(ptyId)
    }
  }
  // Why: pre-layout tabs keep their only PTY on the tab row itself.
  const legacyPtyId = (session.tabsByWorktree[worktreeId] ?? []).find(
    (tab) => tab.id === tabId
  )?.ptyId
  if (legacyPtyId) {
    ptyIds.add(legacyPtyId)
  }
  return [...ptyIds]
}

/**
 * Drop the agent sessions parked on a closed tab.
 *
 * A sleeping record is a standing instruction to re-create a tab and resume the agent
 * into it on the next worktree activation, so leaving one behind turns a close into a
 * restart. The renderer clears its own copy, but that removal rides the debounced patch
 * while the close itself is flushed synchronously — the host has to clear it too or a
 * quit in between keeps the record.
 */
function retireSleepingAgentSessionsForTab(
  session: WorkspaceSessionState,
  tabId: string
): WorkspaceSessionState {
  const records = session.sleepingAgentSessionsByPaneKey
  if (!records) {
    return session
  }
  const next = { ...records }
  let removed = false
  for (const [paneKey, record] of Object.entries(records)) {
    if (paneKey.startsWith(`${tabId}:`) || record.tabId === tabId) {
      delete next[paneKey]
      removed = true
    }
  }
  return removed ? { ...session, sleepingAgentSessionsByPaneKey: next } : session
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
      // Why: still unpark its agents — a sleeping record outlives the tab it names and
      // would rebuild it, and the tab being gone is exactly when nothing else clears it.
      next = retireSleepingAgentSessionsForTab(next, closure.tabId)
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
    next = retireSleepingAgentSessionsForTab(next, closure.tabId)
  }
  return next
}

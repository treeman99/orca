import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type {
  WorkspaceSessionPatch,
  WorkspaceSessionState
} from '../../shared/workspace-session-state-types'
import {
  collectPersistedTerminalTabPtyIds,
  retireClosedTerminalTabsFromPersistence
} from '../runtime/terminal-tab-close-retirement'

/** The slice of OrcaRuntimeService a tab close needs, so tests need no runtime. */
export type ClosedTerminalTabSessionTerminator = {
  terminateSessionsForClosedTerminalTabs(
    closures: readonly { worktreeId: string; tabId: string; ptyIds: readonly string[] }[]
  ): void
}

function parseTabClosures(value: unknown): { worktreeId: string; tabId: string }[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    const closure = entry as { worktreeId?: unknown; tabId?: unknown } | null
    return typeof closure?.worktreeId === 'string' &&
      closure.worktreeId.length > 0 &&
      typeof closure.tabId === 'string' &&
      closure.tabId.length > 0
      ? [{ worktreeId: closure.worktreeId, tabId: closure.tabId }]
      : []
  })
}

export function registerSessionHandlers(
  store: Store,
  runtime?: ClosedTerminalTabSessionTerminator | null
): void {
  // Why: hostId is an optional second arg so an older renderer that invokes
  // these channels without it keeps reading/writing the 'local' partition
  // exactly as before. Channel names stay stable.
  ipcMain.handle('session:get', (_event, hostId?: string | null) => {
    return store.getWorkspaceSession(hostId)
  })

  ipcMain.handle('session:set', (_event, args: WorkspaceSessionState, hostId?: string | null) => {
    store.setWorkspaceSession(args, hostId)
  })

  ipcMain.handle('session:patch', (_event, args: WorkspaceSessionPatch, hostId?: string | null) => {
    store.patchWorkspaceSession(args, hostId)
  })

  // Why: terminal membership is host-authoritative — renderer writes get rebased onto
  // the host's copy — so a close click has to reach the host or it is silently undone
  // and the tab returns on the next launch. Flushed here rather than left to the 1s
  // debounce so a quit right after the click cannot lose the deletion either.
  ipcMain.handle(
    'session:retireClosedTerminalTabs',
    (_event, args: { closures?: unknown } | undefined, hostId?: string | null) => {
      const closures = parseTabClosures(args?.closures)
      if (closures.length === 0) {
        return
      }
      const session = store.getWorkspaceSession(hostId)
      // Why: sessions are ended before the tab is de-persisted, because the durable layout
      // is the only place a never-attached pane's PTY is named. Doing it after would read
      // an emptied session and leave those processes for startup recovery to adopt.
      runtime?.terminateSessionsForClosedTerminalTabs(
        closures.map((closure) => ({
          ...closure,
          ptyIds: collectPersistedTerminalTabPtyIds(session, closure.worktreeId, closure.tabId)
        }))
      )
      const current = store.getWorkspaceSession(hostId)
      const retired = retireClosedTerminalTabsFromPersistence(current, closures)
      if (retired === current) {
        return
      }
      store.setWorkspaceSession(retired, hostId)
      store.flushOrThrow()
    }
  )

  ipcMain.handle('session:flush', () => {
    // Why: durable lifecycle RPCs must propagate disk failures instead of
    // returning success through Store.flush(), which intentionally only logs.
    store.flushOrThrow()
  })

  // Synchronous variant for the renderer's beforeunload handler.
  // sendSync blocks the renderer until this returns, guaranteeing the
  // data (including terminal scrollback buffers) is persisted to disk
  // before the window closes — regardless of before-quit ordering.
  ipcMain.on('session:set-sync', (event, args: WorkspaceSessionState, hostId?: string | null) => {
    store.setWorkspaceSession(args, hostId)
    store.flush()
    event.returnValue = true
  })

  ipcMain.on(
    'session:read-terminal-scrollback-sync',
    (event, args: { ref?: unknown } | undefined) => {
      event.returnValue =
        typeof args?.ref === 'string' ? store.readTerminalScrollbackSnapshot(args.ref) : null
    }
  )
}

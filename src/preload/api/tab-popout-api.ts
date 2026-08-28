import type {
  TabPopoutContext,
  TabPopoutSnapshot,
  TabPopoutWindowState
} from '../../shared/tab-popout'

export type TabPopoutApi = {
  /** Main window: detach a tab. Pass a windowKey to add it to an existing
   *  detached window as a tab; omit it to open a new window. */
  open: (context: TabPopoutContext, targetWindowKey?: string | null) => Promise<boolean>
  /** Either window: return a detached tab to the main window's tab bar. */
  returnTab: (tabId: string) => Promise<boolean>
  /** Pop-out window: switch which of its tabs is showing. */
  activate: (tabId: string) => Promise<boolean>
  snapshot: () => Promise<TabPopoutSnapshot>
  /** Pop-out window: fetch the tabs it hosts. */
  requestWindowState: (windowKey: string) => Promise<TabPopoutWindowState | null>
  /** Main window: push a refreshed title/layout for one detached tab. */
  updateContext: (context: TabPopoutContext) => Promise<boolean>
  /** Pop-out window: return the tab and reactivate it in the main window. */
  focusInMainWindow: (tabId: string) => Promise<boolean>
  /** Main window: detached tabs and windows, so the tab bar and menus stay in sync. */
  onChanged: (callback: (snapshot: TabPopoutSnapshot) => void) => () => void
  /** Pop-out window: its tab list or active tab changed. */
  onWindowStateChanged: (callback: (state: TabPopoutWindowState) => void) => () => void
  /** Main window: activate a tab that was just pulled back from a pop-out. */
  onActivateTab: (callback: (tabId: string) => void) => () => void
}

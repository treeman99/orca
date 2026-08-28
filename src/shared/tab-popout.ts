import type { TabContentType } from './tab-types'
import type { TerminalLayoutSnapshot } from './terminal-tab-types'

/** Everything a pop-out window needs to render one detached tab. The main
 *  renderer still owns the tab in its store — this is a render delegation, so
 *  the pop-out never publishes a window graph or writes the workspace session. */
export type TabPopoutContext = {
  tabId: string
  worktreeId: string
  contentType: TabContentType
  /** Resolved display title at detach time; refreshed by tabPopout:updateContext. */
  title: string
  /** Terminal pane tree plus its live ptyId per leaf. Null for non-terminal tabs. */
  layout: TerminalLayoutSnapshot | null
}

/** One pop-out window's whole contents. A window holds several detached tabs and
 *  renders the active one, so windows can be reused instead of multiplying. */
export type TabPopoutWindowState = {
  windowKey: string
  tabs: TabPopoutContext[]
  activeTabId: string | null
}

/** What the main window needs to offer "send to an existing detached window". */
export type TabPopoutWindowSummary = {
  windowKey: string
  /** Active tab's title, used to name the window in menus. */
  title: string
  tabCount: number
}

/** Broadcast to the main renderer whenever detached windows or their tabs change. */
export type TabPopoutSnapshot = {
  /** Every detached tab id, so the tab bar can drop them. */
  tabIds: string[]
  windows: TabPopoutWindowSummary[]
}

export function isTabPopoutContext(value: unknown): value is TabPopoutContext {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<TabPopoutContext>
  return (
    typeof candidate.tabId === 'string' &&
    candidate.tabId.length > 0 &&
    typeof candidate.worktreeId === 'string' &&
    typeof candidate.contentType === 'string' &&
    typeof candidate.title === 'string'
  )
}

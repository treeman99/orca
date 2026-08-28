import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type {
  TabPopoutContext,
  TabPopoutSnapshot,
  TabPopoutWindowSummary
} from '../../../../shared/tab-popout'

export type TabPopoutSlice = {
  /** Tabs currently rendered in a detached window. They stay in the store — this
   *  set only hides them from the tab bar and pane area of the main window. */
  poppedOutTabIds: string[]
  /** Open detached windows, so the tab menu can offer "send to this window". */
  tabPopoutWindows: TabPopoutWindowSummary[]
  setTabPopoutSnapshot: (snapshot: TabPopoutSnapshot) => void
  isTabPoppedOut: (tabId: string) => boolean
  /** Detach a tab. With a windowKey it joins that window as a tab; otherwise a new window opens. */
  popOutTab: (tabId: string, targetWindowKey?: string | null) => Promise<boolean>
  /** Pull a detached tab back into the main window. */
  returnTabFromPopout: (tabId: string) => Promise<void>
}

function buildContext(state: AppState, tabId: string): TabPopoutContext | null {
  for (const [worktreeId, tabs] of Object.entries(state.unifiedTabsByWorktree)) {
    const tab = tabs.find((candidate) => candidate.id === tabId)
    if (!tab) {
      continue
    }
    return {
      tabId,
      worktreeId,
      contentType: tab.contentType,
      title: tab.customLabel ?? tab.label,
      layout: state.terminalLayoutsByTabId[tab.id] ?? null
    }
  }
  return null
}

/** Move a group off a tab that just detached, picking the nearest tab still in this window. */
function activateNeighborIfDetached(get: () => AppState, tabId: string, worktreeId: string): void {
  const state = get()
  const tab = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
    (candidate) => candidate.id === tabId
  )
  const group = (state.groupsByWorktree[worktreeId] ?? []).find(
    (candidate) => candidate.id === tab?.groupId
  )
  if (!group || group.activeTabId !== tabId) {
    return
  }
  const detached = new Set(state.poppedOutTabIds)
  detached.add(tabId)
  const next = group.tabOrder.find((id) => !detached.has(id))
  if (next) {
    state.activateTab(next, { worktreeId })
  }
}

export const createTabPopoutSlice: StateCreator<AppState, [], [], TabPopoutSlice> = (set, get) => ({
  poppedOutTabIds: [],
  tabPopoutWindows: [],

  setTabPopoutSnapshot: (snapshot) =>
    set({ poppedOutTabIds: snapshot.tabIds, tabPopoutWindows: snapshot.windows }),

  isTabPoppedOut: (tabId) => get().poppedOutTabIds.includes(tabId),

  popOutTab: async (tabId, targetWindowKey) => {
    const context = buildContext(get(), tabId)
    if (!context) {
      return false
    }
    let opened = false
    try {
      opened = await window.api.tabPopout.open(context, targetWindowKey ?? null)
    } catch (err) {
      console.error('Failed to pop out tab:', err)
      return false
    }
    if (opened) {
      // Why: the detached tab leaves the tab bar, so a group still pointing at it
      // would render the same PTY in both windows.
      activateNeighborIfDetached(get, tabId, context.worktreeId)
    }
    return opened
  },

  returnTabFromPopout: async (tabId) => {
    try {
      await window.api.tabPopout.returnTab(tabId)
    } catch (err) {
      console.error('Failed to return tab from pop-out:', err)
    }
  }
})

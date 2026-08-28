import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { Store } from '../persistence'
import type {
  TabPopoutContext,
  TabPopoutSnapshot,
  TabPopoutWindowState
} from '../../shared/tab-popout'
import {
  registerTabPopoutWebContents,
  unregisterTabPopoutWebContents
} from './tab-popout-renderer-trust'
import { createTabPopoutWindow } from './tab-popout-window-factory'

type PopoutWindowEntry = {
  window: BrowserWindow
  windowKey: string
  // Why: captured at creation — on 'closed' the webContents is already gone and
  // reading .id there throws, which used to abort registry cleanup and leave a
  // phantom zero-tab window in the snapshot.
  webContentsId: number
  tabs: TabPopoutContext[]
  activeTabId: string | null
}

// Why: keyed by window, not by tab — one detached window holds several tabs so
// users can regroup them instead of accumulating one window per tab. The main
// renderer stays the store owner; these windows only render what it delegates.
const popoutWindows = new Map<string, PopoutWindowEntry>()
const windowKeyByTabId = new Map<string, string>()
const stateListeners = new Set<(snapshot: TabPopoutSnapshot) => void>()

function entryForTab(tabId: string): PopoutWindowEntry | null {
  const windowKey = windowKeyByTabId.get(tabId)
  return windowKey ? (popoutWindows.get(windowKey) ?? null) : null
}

function activeTitle(entry: PopoutWindowEntry): string {
  const active = entry.tabs.find((tab) => tab.tabId === entry.activeTabId)
  return active?.title ?? entry.tabs[0]?.title ?? ''
}

export function getTabPopoutSnapshot(): TabPopoutSnapshot {
  return {
    tabIds: [...windowKeyByTabId.keys()],
    windows: [...popoutWindows.values()].map((entry) => ({
      windowKey: entry.windowKey,
      title: activeTitle(entry),
      tabCount: entry.tabs.length
    }))
  }
}

export function getTabPopoutWindowState(windowKey: string): TabPopoutWindowState | null {
  const entry = popoutWindows.get(windowKey)
  return entry
    ? { windowKey: entry.windowKey, tabs: entry.tabs, activeTabId: entry.activeTabId }
    : null
}

/** Subscribe to open/close/regroup transitions so the main renderer can hide or restore tabs. */
export function onTabPopoutStateChanged(
  listener: (snapshot: TabPopoutSnapshot) => void
): () => void {
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}

function publish(entry?: PopoutWindowEntry | null): void {
  if (entry && !entry.window.isDestroyed() && !entry.window.webContents.isDestroyed()) {
    entry.window.setTitle(activeTitle(entry))
    entry.window.webContents.send('tabPopout:windowStateChanged', {
      windowKey: entry.windowKey,
      tabs: entry.tabs,
      activeTabId: entry.activeTabId
    } satisfies TabPopoutWindowState)
  }
  const snapshot = getTabPopoutSnapshot()
  for (const listener of stateListeners) {
    listener(snapshot)
  }
}

function focusWindow(window: BrowserWindow): void {
  if (window.isMinimized()) {
    window.restore()
  }
  window.focus()
}

/**
 * Detach a tab into a pop-out window. With `targetWindowKey` the tab joins that
 * existing window as a new tab; otherwise it opens a fresh window.
 */
export function openTabPopout(
  store: Store | null,
  context: TabPopoutContext,
  targetWindowKey?: string | null
): boolean {
  const existing = entryForTab(context.tabId)
  if (existing && !existing.window.isDestroyed()) {
    existing.activeTabId = context.tabId
    focusWindow(existing.window)
    publish(existing)
    return true
  }

  const target = targetWindowKey ? popoutWindows.get(targetWindowKey) : null
  if (target && !target.window.isDestroyed()) {
    target.tabs.push(context)
    target.activeTabId = context.tabId
    windowKeyByTabId.set(context.tabId, target.windowKey)
    focusWindow(target.window)
    publish(target)
    return true
  }

  const windowKey = randomUUID()
  const window = createTabPopoutWindow({
    store,
    windowKey,
    title: context.title,
    cascadeIndex: popoutWindows.size,
    onClosed: () => handleWindowClosed(windowKey)
  })
  const webContentsId = window.webContents.id
  popoutWindows.set(windowKey, {
    window,
    windowKey,
    webContentsId,
    tabs: [context],
    activeTabId: context.tabId
  })
  windowKeyByTabId.set(context.tabId, windowKey)
  registerTabPopoutWebContents(webContentsId)
  publish()
  return true
}

function handleWindowClosed(windowKey: string): void {
  const entry = popoutWindows.get(windowKey)
  if (!entry) {
    return
  }
  unregisterTabPopoutWebContents(entry.webContentsId)
  for (const tab of entry.tabs) {
    if (windowKeyByTabId.get(tab.tabId) === windowKey) {
      windowKeyByTabId.delete(tab.tabId)
    }
  }
  popoutWindows.delete(windowKey)
  publish()
}

/** Show a different tab inside its pop-out window. */
export function activateTabInPopout(tabId: string): boolean {
  const entry = entryForTab(tabId)
  if (!entry || entry.window.isDestroyed()) {
    return false
  }
  entry.activeTabId = tabId
  focusWindow(entry.window)
  publish(entry)
  return true
}

/** Return one tab to the main window, closing its pop-out only when it was the last tab. */
export function returnTabFromPopout(tabId: string): boolean {
  const entry = entryForTab(tabId)
  if (!entry) {
    return false
  }
  entry.tabs = entry.tabs.filter((tab) => tab.tabId !== tabId)
  windowKeyByTabId.delete(tabId)
  if (entry.tabs.length === 0) {
    popoutWindows.delete(entry.windowKey)
    unregisterTabPopoutWebContents(entry.webContentsId)
    if (!entry.window.isDestroyed()) {
      entry.window.close()
    }
    publish()
    return true
  }
  if (entry.activeTabId === tabId) {
    entry.activeTabId = entry.tabs.at(-1)?.tabId ?? null
  }
  publish(entry)
  return true
}

/** Refresh a detached tab's title/layout after the main renderer's state moves on. */
export function updateTabPopoutContext(context: TabPopoutContext): boolean {
  const entry = entryForTab(context.tabId)
  if (!entry) {
    return false
  }
  const index = entry.tabs.findIndex((tab) => tab.tabId === context.tabId)
  if (index === -1) {
    return false
  }
  entry.tabs[index] = context
  publish(entry)
  return true
}

/** Called when the main window closes so detached tabs never orphan their app window. */
export function closeAllTabPopoutWindows(): void {
  for (const entry of popoutWindows.values()) {
    if (!entry.window.isDestroyed()) {
      entry.window.close()
    }
  }
  popoutWindows.clear()
  windowKeyByTabId.clear()
  publish()
}

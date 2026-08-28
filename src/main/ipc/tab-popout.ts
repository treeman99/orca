import { ipcMain, type WebContents } from 'electron'
import type { Store } from '../persistence'
import {
  isTabPopoutContext,
  type TabPopoutSnapshot,
  type TabPopoutWindowState
} from '../../shared/tab-popout'
import { isTrustedUIRenderer, sendToTrustedUIRenderer } from './ui'
import { isTabPopoutRenderer } from '../window/tab-popout-renderer-trust'
import {
  activateTabInPopout,
  getTabPopoutSnapshot,
  getTabPopoutWindowState,
  onTabPopoutStateChanged,
  openTabPopout,
  returnTabFromPopout,
  updateTabPopoutContext
} from '../window/tab-popout-window'

function readString(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' && field.length > 0 ? field : null
}

// Why: a pop-out returns its own tabs, and the main window pulls tabs back —
// both are legitimate senders for the return channel.
function isTabPopoutParticipant(sender: WebContents): boolean {
  return isTrustedUIRenderer(sender) || isTabPopoutRenderer(sender)
}

export function registerTabPopoutHandlers(store: Store): void {
  ipcMain.removeHandler('tabPopout:open')
  ipcMain.removeHandler('tabPopout:return')
  ipcMain.removeHandler('tabPopout:activate')
  ipcMain.removeHandler('tabPopout:snapshot')
  ipcMain.removeHandler('tabPopout:requestWindowState')
  ipcMain.removeHandler('tabPopout:updateContext')
  ipcMain.removeHandler('tabPopout:focusInMainWindow')

  onTabPopoutStateChanged((snapshot) => {
    sendToTrustedUIRenderer('tabPopout:changed', snapshot)
  })

  ipcMain.handle('tabPopout:open', (event, args: unknown): boolean => {
    if (typeof args !== 'object' || args === null || !isTrustedUIRenderer(event.sender)) {
      return false
    }
    const { context, targetWindowKey } = args as {
      context?: unknown
      targetWindowKey?: unknown
    }
    if (!isTabPopoutContext(context)) {
      return false
    }
    return openTabPopout(
      store,
      context,
      typeof targetWindowKey === 'string' ? targetWindowKey : null
    )
  })

  ipcMain.handle('tabPopout:return', (event, args: unknown): boolean => {
    const tabId = readString(args, 'tabId')
    if (!tabId || !isTabPopoutParticipant(event.sender)) {
      return false
    }
    return returnTabFromPopout(tabId)
  })

  ipcMain.handle('tabPopout:activate', (event, args: unknown): boolean => {
    const tabId = readString(args, 'tabId')
    if (!tabId || !isTabPopoutParticipant(event.sender)) {
      return false
    }
    return activateTabInPopout(tabId)
  })

  ipcMain.handle('tabPopout:snapshot', (event): TabPopoutSnapshot => {
    return isTabPopoutParticipant(event.sender)
      ? getTabPopoutSnapshot()
      : { tabIds: [], windows: [] }
  })

  ipcMain.handle(
    'tabPopout:requestWindowState',
    (event, args: unknown): TabPopoutWindowState | null => {
      const windowKey = readString(args, 'windowKey')
      if (!windowKey || !isTabPopoutRenderer(event.sender)) {
        return null
      }
      return getTabPopoutWindowState(windowKey)
    }
  )

  ipcMain.handle('tabPopout:updateContext', (event, args: unknown): boolean => {
    if (!isTrustedUIRenderer(event.sender) || !isTabPopoutContext(args)) {
      return false
    }
    return updateTabPopoutContext(args)
  })

  // Why: "show this in the main window" returns the tab and asks the main
  // renderer to activate it, so it lands back where the user expects.
  ipcMain.handle('tabPopout:focusInMainWindow', (event, args: unknown): boolean => {
    const tabId = readString(args, 'tabId')
    if (!tabId || !isTabPopoutRenderer(event.sender)) {
      return false
    }
    const returned = returnTabFromPopout(tabId)
    if (returned) {
      sendToTrustedUIRenderer('tabPopout:activateTab', tabId)
    }
    return returned
  })
}

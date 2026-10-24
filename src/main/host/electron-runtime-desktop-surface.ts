import { isResourceWindowVisible } from '../window/resource-view-admission'
import { BrowserWindow, dialog, ipcMain, Notification, powerMonitor } from 'electron'
import { readDesktopAwayState } from '../notifications/desktop-away-state'
import type { RuntimeDesktopSurface } from '../runtime/runtime-desktop-surface'
import { translateMain } from '../i18n/main-i18n'
import { encodeRepoIconPng } from './electron-repo-icon-png'
import { fetchRepoIconWithManualRedirects } from './electron-repo-icon-fetch'
import { ORCA_SIDEBAR_INPUTS_IS_MAIN } from '../../shared/sidebar-inputs-switch'

/** The desktop implementation of the runtime's optional desktop facilities. */
export const electronRuntimeDesktopSurface: RuntimeDesktopSurface = {
  translateNotification: translateMain,
  isAwayForMobileNotifications: () => readDesktopAwayState(powerMonitor),
  showNotification: ({ title, body }) => {
    if (!Notification.isSupported()) {
      return false
    }
    new Notification({ title, body }).show()
    return true
  },
  findWindowById: (id) => BrowserWindow.fromId(id),
  isResourceViewVisible: (sender) => isResourceWindowVisible(BrowserWindow.fromWebContents(sender)),
  onIpc: (channel, listener) => {
    ipcMain.on(channel, listener as Parameters<typeof ipcMain.on>[1])
  },
  removeIpcListener: (channel, listener) => {
    ipcMain.removeListener(channel, listener as Parameters<typeof ipcMain.removeListener>[1])
  },
  confirmComputerUseAction: async (detail) => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    if (!window) {
      return 'no-window'
    }
    const { response } = await dialog.showMessageBox(window, {
      type: 'question',
      // Deny is both the default button and the Esc/close result: a dismissed prompt
      // must never read as consent.
      buttons: [
        translateMain('computerUse.approval.deny', 'Deny'),
        translateMain('computerUse.approval.allow', 'Allow')
      ],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: translateMain('computerUse.approval.title', 'Allow agent to control your computer?'),
      message: translateMain(
        'computerUse.approval.message',
        'An agent wants to act on an app outside Orca.'
      ),
      detail
    })
    return response === 1 ? 'allowed' : 'denied'
  },
  // Switch point: only the phone's icon source encodes and fetches through these.
  ...(ORCA_SIDEBAR_INPUTS_IS_MAIN
    ? { encodeRepoIconPng, fetchRepoIcon: fetchRepoIconWithManualRedirects }
    : {})
}

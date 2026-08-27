import { BrowserWindow, dialog, ipcMain, Notification } from 'electron'
import type { RuntimeDesktopSurface } from '../runtime/runtime-desktop-surface'
import { translateMain } from '../i18n/main-i18n'

/** The desktop implementation of the runtime's optional desktop facilities. */
export const electronRuntimeDesktopSurface: RuntimeDesktopSurface = {
  showNotification: ({ title, body }) => {
    if (!Notification.isSupported()) {
      return false
    }
    new Notification({ title, body }).show()
    return true
  },
  findWindowById: (id) => BrowserWindow.fromId(id),
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
  }
}

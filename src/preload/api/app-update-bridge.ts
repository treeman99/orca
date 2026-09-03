import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import { APP_UPDATE_STATUS_EVENT, type AppUpdateCheckStatus } from '../../shared/app-update-check'

export const appUpdateApi = {
  getStatus: (): Promise<AppUpdateCheckStatus> => ipcRenderer.invoke('appUpdate:getStatus'),
  check: (): Promise<AppUpdateCheckStatus> => ipcRenderer.invoke('appUpdate:check'),
  dismissVersion: (args: { version: string }): Promise<AppUpdateCheckStatus> =>
    ipcRenderer.invoke('appUpdate:dismissVersion', args),
  openReleasePage: (): Promise<void> => ipcRenderer.invoke('appUpdate:openReleasePage'),
  onStatus: (callback: (status: AppUpdateCheckStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AppUpdateCheckStatus) =>
      callback(status)
    ipcRenderer.on(APP_UPDATE_STATUS_EVENT, listener)
    return () => ipcRenderer.removeListener(APP_UPDATE_STATUS_EVENT, listener)
  }
} satisfies PreloadApi['appUpdate']

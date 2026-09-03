import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type {
  TabPopoutContext,
  TabPopoutSnapshot,
  TabPopoutWindowState
} from '../../shared/tab-popout'

export const tabPopoutApi = {
  open: (context: TabPopoutContext, targetWindowKey?: string | null): Promise<boolean> =>
    ipcRenderer.invoke('tabPopout:open', { context, targetWindowKey: targetWindowKey ?? null }),
  returnTab: (tabId: string): Promise<boolean> => ipcRenderer.invoke('tabPopout:return', { tabId }),
  activate: (tabId: string): Promise<boolean> => ipcRenderer.invoke('tabPopout:activate', { tabId }),
  snapshot: (): Promise<TabPopoutSnapshot> => ipcRenderer.invoke('tabPopout:snapshot'),
  requestWindowState: (windowKey: string): Promise<TabPopoutWindowState | null> =>
    ipcRenderer.invoke('tabPopout:requestWindowState', { windowKey }),
  updateContext: (context: TabPopoutContext): Promise<boolean> =>
    ipcRenderer.invoke('tabPopout:updateContext', context),
  focusInMainWindow: (tabId: string): Promise<boolean> =>
    ipcRenderer.invoke('tabPopout:focusInMainWindow', { tabId }),
  onChanged: (callback: (snapshot: TabPopoutSnapshot) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: TabPopoutSnapshot): void =>
      callback(snapshot)
    ipcRenderer.on('tabPopout:changed', listener)
    return () => ipcRenderer.removeListener('tabPopout:changed', listener)
  },
  onWindowStateChanged: (callback: (state: TabPopoutWindowState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: TabPopoutWindowState): void =>
      callback(state)
    ipcRenderer.on('tabPopout:windowStateChanged', listener)
    return () => ipcRenderer.removeListener('tabPopout:windowStateChanged', listener)
  },
  onActivateTab: (callback: (tabId: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, tabId: string): void => callback(tabId)
    ipcRenderer.on('tabPopout:activateTab', listener)
    return () => ipcRenderer.removeListener('tabPopout:activateTab', listener)
  }
} satisfies PreloadApi['tabPopout']

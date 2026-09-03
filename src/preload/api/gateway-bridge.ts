import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type {
  GatewayLoginProgress,
  GatewayLoginResult,
  GatewayStatus
} from '../../shared/gateway-auth'

export const gatewayApi = {
  getStatus: (): Promise<GatewayStatus> => ipcRenderer.invoke('gateway:getStatus'),
  login: (): Promise<GatewayLoginResult> => ipcRenderer.invoke('gateway:login'),
  cancelLogin: (): Promise<void> => ipcRenderer.invoke('gateway:cancelLogin'),
  onLoginProgress: (callback: (progress: GatewayLoginProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: GatewayLoginProgress) =>
      callback(progress)
    ipcRenderer.on('gateway:loginProgress', listener)
    return () => ipcRenderer.removeListener('gateway:loginProgress', listener)
  }
} satisfies PreloadApi['gateway']

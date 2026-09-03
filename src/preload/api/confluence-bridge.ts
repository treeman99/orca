import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const confluenceApi = {
  testConnection: (args?: { baseUrl?: string; token?: string; username?: string }) =>
    ipcRenderer.invoke('confluence:testConnection', args)
} satisfies PreloadApi['confluence']

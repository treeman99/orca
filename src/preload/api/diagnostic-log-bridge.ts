import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type { DiagnosticLogStatus } from './diagnostic-log-api'

export const diagnosticLogApi = {
  write: (topic: string, fields?: Record<string, string | number | boolean>): Promise<boolean> =>
    ipcRenderer.invoke('diagnosticLog:write', { topic, fields: fields ?? {} }),
  status: (): Promise<DiagnosticLogStatus | null> => ipcRenderer.invoke('diagnosticLog:status')
} satisfies PreloadApi['diagnosticLog']

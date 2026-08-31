// IPC for the opt-in troubleshooting log. The renderer owns several decisions
// worth recording (worker-pane placement among them), so it needs a way to put a
// line in the same file main writes to — one file keeps the ordering readable.

import { ipcMain } from 'electron'
import { join } from 'node:path'
import type { Store } from '../persistence'
import {
  bindDiagnosticLogSettings,
  DIAGNOSTIC_LOG_FILENAME,
  isDiagnosticLogEnabled,
  resolveDiagnosticLogDirectory,
  writeDiagnosticLine
} from '../observability/diagnostic-log'
import { isTrustedUIRenderer } from './ui'

// Bounded so a renderer bug cannot fill the disk with one long line.
const MAX_TOPIC_LENGTH = 64
const MAX_FIELDS = 12
const MAX_VALUE_LENGTH = 200

function readTopic(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const topic = (value as Record<string, unknown>).topic
  return typeof topic === 'string' && topic.length > 0 && topic.length <= MAX_TOPIC_LENGTH
    ? topic
    : null
}

function readFields(value: unknown): Record<string, unknown> {
  const raw = (value as Record<string, unknown> | null)?.fields
  if (typeof raw !== 'object' || raw === null) {
    return {}
  }
  const fields: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(raw).slice(0, MAX_FIELDS)) {
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      fields[key] = String(entry).slice(0, MAX_VALUE_LENGTH)
    }
  }
  return fields
}

export function registerDiagnosticLogHandlers(store: Store): void {
  ipcMain.removeHandler('diagnosticLog:write')
  ipcMain.removeHandler('diagnosticLog:status')

  bindDiagnosticLogSettings(store)

  ipcMain.handle('diagnosticLog:write', (event, args: unknown): boolean => {
    const topic = readTopic(args)
    if (!topic || !isTrustedUIRenderer(event.sender)) {
      return false
    }
    writeDiagnosticLine(topic, readFields(args))
    return true
  })

  // Why the resolved path and not just the setting: an empty directory setting
  // means "the app's own logs folder", and the user has to be able to find it.
  ipcMain.handle('diagnosticLog:status', (event): { enabled: boolean; filePath: string } | null => {
    if (!isTrustedUIRenderer(event.sender)) {
      return null
    }
    const settings = store.getSettings()
    return {
      enabled: isDiagnosticLogEnabled(settings),
      filePath: join(resolveDiagnosticLogDirectory(settings), DIAGNOSTIC_LOG_FILENAME)
    }
  })
}

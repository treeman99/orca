// Opt-in plain-text troubleshooting log, separate from `main.trace.ndjson`.
//
// Why not the NDJSON trace: this file exists to be read by a person and, in
// locked-down deployments, retyped by hand into a bug report. So every record is
// one short line, and every line starts with the same literal tag so it can be
// found with one search and quoted without context.
//
// Nothing here leaves the machine. It is off unless the user turns it on.

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { getLogsDirectory } from './logs-directory'

/** The literal every line starts with, so one search finds the whole log. */
export const DIAGNOSTIC_LOG_TAG = 'ORCA-DIAG'
export const DIAGNOSTIC_LOG_FILENAME = 'orca-diagnostic.log'

// One rotation is enough for a support log the user turns on for a single repro.
const MAX_BYTES = 5 * 1024 * 1024

type SettingsSource = { getSettings: () => GlobalSettings }

let settingsSource: SettingsSource | null = null
let warnedPath: string | null = null

/** Bind the settings the log reads. Called once while core IPC handlers register. */
export function bindDiagnosticLogSettings(source: SettingsSource | null): void {
  settingsSource = source
}

export function resolveDiagnosticLogDirectory(settings: GlobalSettings | null): string {
  const configured = settings?.diagnosticLogDirectory?.trim()
  return configured ? configured : getLogsDirectory()
}

export function isDiagnosticLogEnabled(settings: GlobalSettings | null): boolean {
  return settings?.diagnosticLogEnabled === true
}

/**
 * `key=value` pairs, skipping empties so a line never carries `k=undefined`.
 * Values are flattened to one token because a wrapped line is a line the user
 * has to retype twice.
 */
function formatFields(fields: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    parts.push(`${key}=${String(value).replace(/\s+/g, '_')}`)
  }
  return parts.join(' ')
}

function timestamp(): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

export function formatDiagnosticLine(topic: string, fields: Record<string, unknown>): string {
  const formatted = formatFields(fields)
  return `[${DIAGNOSTIC_LOG_TAG} ${timestamp()}] ${topic}${formatted ? ` ${formatted}` : ''}`
}

function rotateIfLarge(filePath: string): void {
  try {
    if (statSync(filePath).size < MAX_BYTES) {
      return
    }
    renameSync(filePath, `${filePath}.1`)
  } catch {
    // Missing file is the normal first-write case; a failed rotate must not lose the line.
  }
}

/**
 * Append one line. Silent no-op while the setting is off, and never throws — a
 * troubleshooting aid must not be able to break the flow it is observing.
 */
export function writeDiagnosticLine(topic: string, fields: Record<string, unknown> = {}): void {
  const settings = settingsSource?.getSettings() ?? null
  if (!isDiagnosticLogEnabled(settings)) {
    return
  }
  const directory = resolveDiagnosticLogDirectory(settings)
  const filePath = join(directory, DIAGNOSTIC_LOG_FILENAME)
  try {
    mkdirSync(directory, { recursive: true })
    if (existsSync(filePath)) {
      rotateIfLarge(filePath)
    }
    appendFileSync(filePath, `${formatDiagnosticLine(topic, fields)}\n`, 'utf8')
    warnedPath = null
  } catch (err) {
    // Why once per path: a bad directory would otherwise repeat this on every line.
    if (warnedPath !== filePath) {
      warnedPath = filePath
      console.warn(`[diagnostic-log] cannot write ${filePath}:`, err)
    }
  }
}

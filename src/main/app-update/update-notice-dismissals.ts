// Remembers the one release the user said "don't tell me about this again" for.
//
// Plain JSON in the user's profile, mirroring github-enterprise-host-store.ts: it is
// a per-user preference about a notification, never the machine-wide policy file the
// user cannot write. One version is enough — a dismissal only has to outlast the
// release it names, and anything newer compares greater and notifies again.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isValidAppVersion } from '../../shared/app-version'

const FILE_NAME = 'app-update-dismissed.json'

function dismissalFilePath(): string | null {
  try {
    const userData = app?.getPath?.('userData')
    return userData ? path.join(userData, FILE_NAME) : null
  } catch {
    return null
  }
}

/** The dismissed version, or null when none is saved or the file is unreadable. */
export function readDismissedUpdateVersion(): string | null {
  const filePath = dismissalFilePath()
  if (!filePath || !existsSync(filePath)) {
    return null
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as { version?: unknown }
    const version = typeof parsed?.version === 'string' ? parsed.version : ''
    return isValidAppVersion(version) ? version : null
  } catch {
    return null
  }
}

/** Persist (or, with an unusable version, clear) the dismissed release. */
export function writeDismissedUpdateVersion(version: string | null): void {
  const filePath = dismissalFilePath()
  if (!filePath) {
    return
  }
  if (!version || !isValidAppVersion(version)) {
    rmSync(filePath, { force: true })
    return
  }
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify({ version })}\n`, 'utf8')
}

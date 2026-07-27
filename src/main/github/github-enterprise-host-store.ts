// Remembers the corporate GitHub Enterprise host a user typed in Settings, so the
// field prefills next launch and status checks target it. The host is not a secret
// (unlike the gh token, which lives in gh's own keyring), so this is plain JSON in
// the user's profile — never the machine-wide policy file, which the user cannot write.
//
// The corporate policy's githubEnterpriseHost still wins as the default when set; this
// store only carries a user's own entry on a machine with no policy host.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { normalizeHost } from '../../shared/enterprise-policy'

const FILE_NAME = 'github-enterprise-host.json'

function hostFilePath(): string | null {
  try {
    const userData = app?.getPath?.('userData')
    return userData ? path.join(userData, FILE_NAME) : null
  } catch {
    return null
  }
}

/** The stored GHES host, normalized, or null when none is saved or it is unreadable. */
export function readStoredGithubEnterpriseHost(): string | null {
  const filePath = hostFilePath()
  if (!filePath || !existsSync(filePath)) {
    return null
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as { host?: unknown }
    return normalizeHost(typeof parsed?.host === 'string' ? parsed.host : null)
  } catch {
    return null
  }
}

/** Persist (or, with a blank/invalid host, clear) the user's GHES host. */
export function writeStoredGithubEnterpriseHost(host: string | null): void {
  const filePath = hostFilePath()
  if (!filePath) {
    return
  }
  const normalized = normalizeHost(host)
  if (!normalized) {
    rmSync(filePath, { force: true })
    return
  }
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify({ host: normalized })}\n`, 'utf8')
}

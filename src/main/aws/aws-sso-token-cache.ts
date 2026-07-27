// Whether a profile is still signed in, read from the AWS CLI's own token cache.
//
// Asking the CLI (`aws sts get-caller-identity`) would cost a network round trip per
// status refresh; the cache answers offline. Each token file carries the portal URL it
// belongs to, so a profile matches by start URL rather than by the CLI's internal
// file-name hashing (which differs between legacy and sso-session configs).

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { awsSsoCacheDirectoryPath } from './aws-cli-paths'

export type AwsSsoCachedToken = { startUrl: string; expiresAt: string }

/**
 * Normalizes the CLI's expiry stamp to something `Date` parses. Older CLIs wrote
 * `2026-07-27T04:05:45UTC`, which is not ISO 8601 and parses as Invalid Date.
 */
export function normalizeAwsSsoExpiry(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  const iso = trimmed.endsWith('UTC') ? `${trimmed.slice(0, -3)}Z` : trimmed
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

/**
 * A token-cache entry, or null for the other files in that directory — the client
 * registration files (`botocore-client-id-*.json`) have an expiry but no start URL,
 * and treating one as a session would report a signed-in state that does not exist.
 */
export function parseAwsSsoCacheEntry(document: unknown): AwsSsoCachedToken | null {
  if (typeof document !== 'object' || document === null) {
    return null
  }
  const record = document as Record<string, unknown>
  const startUrl = typeof record.startUrl === 'string' ? record.startUrl.trim() : ''
  const accessToken = typeof record.accessToken === 'string' ? record.accessToken : ''
  const rawExpiry = typeof record.expiresAt === 'string' ? record.expiresAt : ''
  if (!startUrl || !accessToken || !rawExpiry) {
    return null
  }
  const expiresAt = normalizeAwsSsoExpiry(rawExpiry)
  return expiresAt ? { startUrl, expiresAt } : null
}

/** True when `expiresAt` is in the future. A null expiry is "not signed in". */
export function isAwsSsoTokenActive(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) {
    return false
  }
  const parsed = Date.parse(expiresAt)
  return !Number.isNaN(parsed) && parsed > now.getTime()
}

/** Latest expiry per start URL. Empty when the cache directory does not exist yet. */
export function readAwsSsoTokenExpiries(): Map<string, string> {
  const directory = awsSsoCacheDirectoryPath()
  let fileNames: string[]
  try {
    fileNames = readdirSync(directory).filter((name) => name.endsWith('.json'))
  } catch {
    return new Map()
  }

  const expiries = new Map<string, string>()
  for (const fileName of fileNames) {
    let entry: AwsSsoCachedToken | null = null
    try {
      entry = parseAwsSsoCacheEntry(
        JSON.parse(readFileSync(path.join(directory, fileName), 'utf8'))
      )
    } catch {
      // A half-written or non-JSON file in a cache directory is not an error here.
      continue
    }
    if (!entry) {
      continue
    }
    // Several files can name the same portal (one per registration); the newest wins.
    const known = expiries.get(entry.startUrl)
    if (!known || Date.parse(entry.expiresAt) > Date.parse(known)) {
      expiries.set(entry.startUrl, entry.expiresAt)
    }
  }
  return expiries
}

// Remembers which AWS profile the user signs in as, so the picker prefills next launch.
// A profile name is not a secret (the token is, and that one lives in the AWS CLI's own
// cache), so this is plain JSON in the user's profile directory.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const FILE_NAME = 'aws-sso-profile.json'
// A profile name is an INI section label, not a document.
const MAX_PROFILE_LENGTH = 256

function profileFilePath(): string | null {
  try {
    const userData = app?.getPath?.('userData')
    return userData ? path.join(userData, FILE_NAME) : null
  } catch {
    return null
  }
}

export function normalizeAwsProfileName(profile: string | null | undefined): string | null {
  const trimmed = profile?.trim() ?? ''
  return trimmed && trimmed.length <= MAX_PROFILE_LENGTH ? trimmed : null
}

/** The stored profile name, or null when none is saved or the file is unreadable. */
export function readStoredAwsSsoProfile(): string | null {
  const filePath = profileFilePath()
  if (!filePath || !existsSync(filePath)) {
    return null
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as { profile?: unknown }
    return normalizeAwsProfileName(typeof parsed?.profile === 'string' ? parsed.profile : null)
  } catch {
    return null
  }
}

/** Persist (or, with a blank name, clear) the user's profile choice. */
export function writeStoredAwsSsoProfile(profile: string | null): void {
  const filePath = profileFilePath()
  if (!filePath) {
    return
  }
  const normalized = normalizeAwsProfileName(profile)
  if (!normalized) {
    rmSync(filePath, { force: true })
    return
  }
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify({ profile: normalized })}\n`, 'utf8')
}

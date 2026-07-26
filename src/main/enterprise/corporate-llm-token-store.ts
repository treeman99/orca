// Per-user tokens for the company's self-hosted model endpoints.
//
// A token identifies a person, so it is entered by that person and stored in
// THEIR profile — never in the machine-wide policy file, which every account on
// the box can read. Storage is the settings directory (app userData), not a temp
// directory: temp is subject to cleanup and the user would silently lose the
// token mid-session.
//
// Encrypted with Electron safeStorage, which is DPAPI on Windows — the corporate
// target — so the ciphertext is bound to the user account and is not readable by
// another profile even with filesystem access.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'

const DIRECTORY_NAME = 'corporate-llm-tokens'

// Why: the id becomes a filename, and an administrator writes it into the policy
// file by hand — refuse traversal and separators rather than trusting it.
function tokenFileName(endpointId: string): string | null {
  return /^[a-zA-Z0-9._-]{1,64}$/.test(endpointId) ? `${endpointId}.token` : null
}

function tokenDirectory(): string | null {
  try {
    const userData = app?.getPath?.('userData')
    return userData ? path.join(userData, DIRECTORY_NAME) : null
  } catch {
    return null
  }
}

function tokenPath(endpointId: string): string | null {
  const directory = tokenDirectory()
  const fileName = tokenFileName(endpointId)
  return directory && fileName ? path.join(directory, fileName) : null
}

/** The stored token for `endpointId`, or null when none is saved or it is unreadable. */
export function readCorporateLlmToken(endpointId: string): string | null {
  const target = tokenPath(endpointId)
  if (!target) {
    return null
  }
  let raw: Buffer
  try {
    raw = readFileSync(target)
  } catch {
    return null
  }
  if (raw.length === 0) {
    return null
  }
  try {
    // Why: written only via safeStorage, so a decrypt failure means the OS
    // keychain is unavailable or the ciphertext belongs to another account —
    // both are "no usable token", never a reason to fall back to plaintext.
    const token = safeStorage.decryptString(raw).trim()
    return token.length > 0 ? token : null
  } catch {
    return null
  }
}

export type CorporateLlmTokenWriteResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported-id' | 'encryption-unavailable' | 'write-failed' }

/** Save (or, with an empty token, clear) the user's token for `endpointId`. */
export function writeCorporateLlmToken(
  endpointId: string,
  token: string
): CorporateLlmTokenWriteResult {
  const target = tokenPath(endpointId)
  if (!target) {
    return { ok: false, reason: 'unsupported-id' }
  }
  if (!token.trim()) {
    try {
      rmSync(target, { force: true })
      return { ok: true }
    } catch {
      return { ok: false, reason: 'write-failed' }
    }
  }
  if (!safeStorage.isEncryptionAvailable()) {
    // Why: refuse rather than degrade. A plaintext token on disk is exactly the
    // outcome this fork's threat model exists to prevent.
    return { ok: false, reason: 'encryption-unavailable' }
  }
  try {
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, safeStorage.encryptString(token.trim()), { mode: 0o600 })
    return { ok: true }
  } catch {
    return { ok: false, reason: 'write-failed' }
  }
}

/** Whether a token is saved, for rendering state without decrypting it. */
export function hasCorporateLlmToken(endpointId: string): boolean {
  return readCorporateLlmToken(endpointId) !== null
}

// Pure parsers for `gateway-cli` output. Kept apart from the runners so the fiddly
// regexes are unit tested without spawning the CLI.
//
// Unlike the AWS SSO lane this replaced, we have not seen `gateway-cli verify`'s real
// output yet, so the verify parser is defensive by design: JSON first, then text
// heuristics, then the exit code. Guessing a format and failing closed would report
// "signed out" to a user who is signed in.

import { stripAnsiControlSequences } from './commit-message-agent-output'

export type GatewayVerification = {
  signedIn: boolean
  expiresAt: string | null
  identity: string | null
  detail: string | null
}

const CODE_LABELLED_RE = /code[:\s]+([A-Za-z0-9-]{4,})/i
const CODE_PAIR_RE = /\b[A-Za-z0-9]{4}-[A-Za-z0-9]{4}\b/
const URL_RE = /https?:\/\/\S+/i
const TRAILING_PUNCTUATION_RE = /[.,;:)\]}'"]+$/
const ERROR_LINE_RE =
  /(an error occurred|^error[:\s]|invalid|unauthorized|access denied|accessdenied|forbidden|expired|failed|refused|timed out)/i

const SIGNED_OUT_RE =
  /not logged in|not signed in|unauthenticated|no valid|expired|login required|please log ?in/i
const SIGNED_IN_RE = /logged in|signed in|authenticated|session (?:is )?(?:valid|active)/i
// `:` and `.` stay out of the run so timestamps and dotted hostnames are never masked.
const OPAQUE_RUN_RE = /[A-Za-z0-9+/_=-]{20,}/g
const SECRET_ASSIGNMENT_RE =
  /([A-Za-z_.-]*(?:key|token|secret|password|authorization|credential)[A-Za-z_.-]*"?\s*[:=]\s*"?)([^\s,"}]+)/gi
const SECRET_KEY_RE = /key|token|secret|password|authorization|credential/i
const TIMESTAMP_RE =
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}|\s*UTC)?/
const DETAIL_MAX_LENGTH = 200

const SIGNED_IN_KEYS = ['signedin', 'valid', 'active', 'authenticated', 'loggedin', 'ok']
const EXPIRES_KEYS = ['expiresat', 'expiration', 'expiry', 'validuntil', 'notafter']
const IDENTITY_KEYS = ['identity', 'user', 'username', 'email', 'subject', 'principal', 'account']
const DETAIL_KEYS = ['detail', 'message', 'status', 'reason', 'error']

/** PTY output carries escape sequences; every parser here starts by dropping them. */
export function stripAnsi(raw: string): string {
  return stripAnsiControlSequences(raw)
}

/**
 * Drops anything that could be a credential. `identity` and `detail` travel over IPC to
 * the renderer, and verify may print the virtual key alongside them.
 */
function redactSecrets(value: string): string {
  return (
    value
      .replace(SECRET_ASSIGNMENT_RE, (_match, label: string) => `${label}***`)
      // A digit inside a 20+ char run means a token, not prose — long words have none.
      .replace(OPAQUE_RUN_RE, (run) => (/\d/.test(run) ? '***' : run))
  )
}

function safeText(value: string | null): string | null {
  if (!value) {
    return null
  }
  const redacted = redactSecrets(value).trim()
  return redacted && redacted !== '***' ? redacted : null
}

/** The authorization URL the CLI printed, else null. */
export function parseGatewayVerificationUrl(output: string): string | null {
  const url = stripAnsi(output).match(URL_RE)?.[0] ?? null
  return url ? url.replace(TRAILING_PUNCTUATION_RE, '') : null
}

/** The confirmation code, uppercased, else null. */
export function parseGatewayUserCode(output: string): string | null {
  const cleaned = stripAnsi(output)
  // Without URLs the bare pair can't match a PKCE query parameter that happens to split 4-4.
  const prose = cleaned.replace(new RegExp(URL_RE.source, 'gi'), ' ')
  const match = prose.match(CODE_PAIR_RE)?.[0] ?? cleaned.match(CODE_LABELLED_RE)?.[1] ?? null
  return match ? match.toUpperCase() : null
}

/**
 * The CLI's own complaint, so a failure shows why instead of only an exit code. Returns
 * the last matching line, so a stack of retries reports the final cause.
 */
export function parseGatewayCliErrorMessage(output: string): string | null {
  const lines = stripAnsi(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && ERROR_LINE_RE.test(line))
  return safeText(lines.at(-1) ?? null)
}

/**
 * Normalizes an expiry stamp to something `Date` parses. The AWS CLI wrote
 * `2026-07-27T04:05:45UTC`, which is not ISO 8601 and parses as Invalid Date; assume
 * gateway-cli can fall into the same trap.
 */
export function normalizeGatewayExpiry(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  const iso = trimmed.replace(/\s*UTC$/i, 'Z')
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

/** Every scalar in the document, keyed by a case/underscore-insensitive name. */
function flattenScalars(node: unknown, into: Map<string, unknown>, depth = 0): void {
  if (depth > 3 || typeof node !== 'object' || node === null) {
    return
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(key)) {
      continue
    }
    const normalized = key.toLowerCase().replace(/[_-]/g, '')
    if (value !== null && typeof value === 'object') {
      flattenScalars(value, into, depth + 1)
    } else if (!into.has(normalized)) {
      into.set(normalized, value)
    }
  }
}

function firstOf(fields: Map<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (fields.has(key)) {
      return fields.get(key)
    }
  }
  return undefined
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value !== 'string') {
    return null
  }
  const lowered = value.trim().toLowerCase()
  if (['true', 'yes', '1', 'active', 'valid'].includes(lowered)) {
    return true
  }
  return ['false', 'no', '0'].includes(lowered) ? false : null
}

function coerceString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null
  }
  return typeof value === 'number' ? String(value) : null
}

/** The JSON document verify printed, if it printed one. */
function parseEmbeddedJson(stdout: string): Map<string, unknown> | null {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start === -1 || end <= start) {
    return null
  }
  let document: unknown
  try {
    document = JSON.parse(stdout.slice(start, end + 1))
  } catch {
    return null
  }
  const fields = new Map<string, unknown>()
  flattenScalars(document, fields)
  return fields.size > 0 ? fields : null
}

/** First line that reads like a sentence, so a `{` from pretty-printed JSON is skipped. */
function firstMeaningfulLine(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => /[A-Za-z]/.test(entry))
  return line ? line.slice(0, DETAIL_MAX_LENGTH) : null
}

export function parseGatewayVerifyOutput(input: {
  stdout: string
  stderr: string
  exitCode: number | null
}): GatewayVerification {
  const stdout = stripAnsi(input.stdout)
  const text = `${stdout}\n${stripAnsi(input.stderr)}`
  const fields = parseEmbeddedJson(stdout)

  let signedIn = fields ? coerceBoolean(firstOf(fields, SIGNED_IN_KEYS)) : null
  let expiresAt = fields
    ? normalizeGatewayExpiry(coerceString(firstOf(fields, EXPIRES_KEYS)) ?? '')
    : null
  const identity = fields ? safeText(coerceString(firstOf(fields, IDENTITY_KEYS))) : null
  // Once the output is JSON, the "first line" is the document itself — noise, not detail.
  const detail = fields ? coerceString(firstOf(fields, DETAIL_KEYS)) : firstMeaningfulLine(text)

  if (signedIn === null && SIGNED_OUT_RE.test(text)) {
    // Negative wording wins: "session expired, please log in" carries both vocabularies.
    signedIn = false
  } else if (signedIn === null && SIGNED_IN_RE.test(text)) {
    signedIn = true
  }
  if (!expiresAt) {
    expiresAt = normalizeGatewayExpiry(text.match(TIMESTAMP_RE)?.[0] ?? '')
  }

  return {
    // Nothing parsed: the exit code is the only signal the CLI definitely gives us.
    signedIn: signedIn ?? input.exitCode === 0,
    expiresAt,
    identity,
    detail: safeText(detail?.slice(0, DETAIL_MAX_LENGTH) ?? null)
  }
}

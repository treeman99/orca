// Reads `gateway-cli verify`'s prose: whether it actually says the session is over, and
// which timestamp — if any — is really an expiry rather than a log stamp.
//
// Split out of gateway-cli-output so the negation- and label-sensitive scanning is tested
// on its own. We still have not seen the CLI's real output, so the rule everywhere here is
// fail-open: an unrecognized line yields no verdict rather than "expired". "Expired" is an
// instruction to log in again, and issuing it on a guess is the expensive mistake; a stale
// "signed in" costs nothing, because the next CLI call fails on its own.

const TIMESTAMP_RE =
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}|\s*UTC)?/

// Labels that introduce an expiry value. `expires`/`expiry`/`expiration` are neutral words:
// they mark where the value is, they do not claim the session is over.
const EXPIRY_LABEL_RE =
  /\bexpir(?:e[sd]?|y|ation)\b|\bvalid[\s_-]*(?:un)?til\b|\bnot[\s_-]*after\b|\bgood[\s_-]*(?:un)?til\b/gi

// A label inside "is not expired" / "never expires" introduces nothing.
const NEGATED_BEFORE_RE =
  /\b(?:not|never|no|non|isn'?t|aren'?t|wasn'?t|hasn'?t|haven'?t|won'?t)\s+(?:yet\s+|been\s+|currently\s+|longer\s+)?$/i
const NEGATION_WINDOW = 32

// Adjacency, not a bare `expired`, separates "the session expired" from "token is not
// expired" and from "expired sessions are pruned hourly".
const EXPIRED_STATE_PATTERNS = [
  /\b(?:has|have|is|are|was|were)\s+expired\b/i,
  /\b(?:session|token|credential|credentials|grant|login|key)s?\s+expired\b/i,
  /^\s*expired[.!]?\s*$/im
]

const SIGNED_OUT_PATTERNS = [
  /\bnot\s+(?:logged|signed)[\s-]*in\b/i,
  /\bunauthenticated\b/i,
  /\bno\s+(?:valid|active)\s+(?:session|credential|credentials|token|login|grant)s?\b/i,
  /\bno\s+(?:active\s+)?session\b/i,
  /\b(?:login|log[\s-]?in|sign[\s-]?in|re-?authentication|re-?auth)\s+required\b/i,
  /\bplease\s+(?:log|sign)[\s-]?in\b/i,
  ...EXPIRED_STATE_PATTERNS
]

const SIGNED_IN_PATTERNS = [
  /\b(?:logged|signed)[\s-]*in\b/i,
  /\bauthenticated\b/i,
  /\bsession\s+(?:is\s+)?(?:valid|active)\b/i,
  /\b(?:session|token|credential)s?\s+(?:is|are)\s+(?:still\s+)?(?:valid|active)\b/i
]

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

function isNegated(line: string, index: number): boolean {
  return NEGATED_BEFORE_RE.test(line.slice(Math.max(0, index - NEGATION_WINDOW), index))
}

/** Text after the line's first expiry label that is not sitting inside a negation. */
function tailAfterExpiryLabel(line: string): string | null {
  EXPIRY_LABEL_RE.lastIndex = 0
  let match = EXPIRY_LABEL_RE.exec(line)
  while (match !== null) {
    if (!isNegated(line, match.index)) {
      return line.slice(match.index + match[0].length)
    }
    match = EXPIRY_LABEL_RE.exec(line)
  }
  return null
}

/**
 * The expiry a label actually introduces, else null. A bare timestamp anywhere in the
 * document does not count — verify may prefix every line with the current time.
 */
export function findLabelledExpiry(text: string): string | null {
  const lines = text.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    const tail = tailAfterExpiryLabel(line)
    if (tail === null) {
      continue
    }
    // `Expires:` on its own line puts the value on the next one.
    const stamp = TIMESTAMP_RE.exec(tail)?.[0] ?? TIMESTAMP_RE.exec(lines[index + 1] ?? '')?.[0]
    const normalized = stamp ? normalizeGatewayExpiry(stamp) : null
    if (normalized) {
      return normalized
    }
  }
  return null
}

/** The sign-in verdict the prose states outright, else null. */
export function readTextSignedInSignal(text: string): boolean | null {
  // "session expired, please log in again" carries both vocabularies; negative wins.
  if (SIGNED_OUT_PATTERNS.some((pattern) => pattern.test(text))) {
    return false
  }
  return SIGNED_IN_PATTERNS.some((pattern) => pattern.test(text)) ? true : null
}

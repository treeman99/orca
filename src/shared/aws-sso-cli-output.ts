// Pure parsers for `aws sso login` output. Kept apart from the PTY runner so the
// fiddly regexes are unit tested without spawning the CLI.
//
// Two flows print different things, and which one runs depends on the CLI version:
//
//   device code (older CLIs, or --use-device-code)
//     ... open the following URL:
//     https://device.sso.us-east-1.amazonaws.com/
//     Then enter the code:
//     ABCD-EFGH
//
//   authorization code + PKCE (AWS CLI v2 default since 2.22)
//     ... open the following URL:
//     https://oidc.us-east-1.amazonaws.com/authorize?response_type=code&...
//
// So a code may never appear; a URL almost always does. Both end with
// "Successfully logged into Start URL: ...".

import { stripAnsiControlSequences } from './commit-message-agent-output'

const USER_CODE_RE = /enter the code:?\s*([A-Za-z0-9]{4}-[A-Za-z0-9]{4})/i
const FOLLOWING_URL_RE = /open the following url:?\s*(https:\/\/\S+)/i
// Fallback: any AWS sign-in endpoint, for wording we have not seen.
const SSO_URL_RE = /(https:\/\/\S*(?:device\.sso|oidc|awsapps)\S*)/i
const COMPLETE_RE = /successfully logged into|successfully logged in\b/i
// The CLI's own failure vocabulary. `could not be found` covers a bad --profile.
const ERROR_LINE_RE =
  /(could not be found|an error occurred|^error[:\s]|invalidgrant|unauthorized|accessdenied|expired|forbidden|failed)/i
// A trailing `.`/`,`/`)` is sentence punctuation, not part of the URL.
const TRAILING_PUNCTUATION_RE = /[.,;:)\]}'"]+$/

function clean(output: string): string {
  return stripAnsiControlSequences(output)
}

/** The device code once the CLI has printed it, uppercased, else null. */
export function parseAwsSsoUserCode(output: string): string | null {
  const match = clean(output).match(USER_CODE_RE)
  return match ? match[1].toUpperCase() : null
}

/** The authorization URL the CLI printed, else null. */
export function parseAwsSsoVerificationUrl(output: string): string | null {
  const cleaned = clean(output)
  const following = cleaned.match(FOLLOWING_URL_RE)
  const fallback = following ? null : cleaned.match(SSO_URL_RE)
  const url = following?.[1] ?? fallback?.[1] ?? null
  return url ? url.replace(TRAILING_PUNCTUATION_RE, '') : null
}

/** True once the CLI has reported the sign-in finished. */
export function outputReportsSsoLoginComplete(output: string): boolean {
  return COMPLETE_RE.test(clean(output))
}

/**
 * The CLI's own complaint, for showing why a sign-in failed instead of only an exit
 * code. Returns the last matching line so a stack of retries reports the final cause.
 */
export function parseAwsCliErrorMessage(output: string): string | null {
  const lines = clean(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && ERROR_LINE_RE.test(line))
  return lines.at(-1) ?? null
}

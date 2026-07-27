// Pure parsers for the output of `gh auth login --hostname <host> --git-protocol
// https --web`. Kept separate from the PTY runner so the fiddly regexes are unit
// tested without spawning a process.
//
// The device flow prints, in order:
//   ! First copy your one-time code: ABCD-1234
//   Press Enter to open <host> in your browser...
//   ✓ Authentication complete.
//   ✓ Logged in as <user>

const ONE_TIME_CODE_RE = /one-time code:\s*([A-Za-z0-9]{4}-[A-Za-z0-9]{4})/
const ENTER_PROMPT_RE = /press enter to open/i
// gh prints "Logged in as <user>" (older) or "Logged in to <host> as <user>" (newer).
const LOGGED_IN_RE = /logged in (?:to \S+ )?as\s+([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)/i
const COMPLETE_RE = /authentication complete|logged in (?:to \S+ )?as\s/i

/** The one-time code once gh has printed it, uppercased, else null. */
export function parseGhOneTimeCode(output: string): string | null {
  const match = output.match(ONE_TIME_CODE_RE)
  return match ? match[1].toUpperCase() : null
}

/** True once gh is waiting on Enter to open the browser and begin polling. */
export function outputAwaitsBrowserEnter(output: string): boolean {
  return ENTER_PROMPT_RE.test(output)
}

/** The authenticated username once gh reports it, else null. */
export function parseGhLoggedInAccount(output: string): string | null {
  const match = output.match(LOGGED_IN_RE)
  return match ? match[1] : null
}

/** True once gh has reported the login finished. */
export function outputReportsLoginComplete(output: string): boolean {
  return COMPLETE_RE.test(output)
}

/** The device-verification URL for a host. gh serves it at <host>/login/device. */
export function ghDeviceVerificationUrl(host: string): string {
  return `https://${host}/login/device`
}

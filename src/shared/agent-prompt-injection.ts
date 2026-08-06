import { iterateTerminalInputChunks, TERMINAL_INPUT_CHUNK_MAX_BYTES } from './terminal-input'

export const AGENT_PROMPT_BRACKETED_PASTE_START = '\x1b[200~'
export const AGENT_PROMPT_BRACKETED_PASTE_END = '\x1b[201~'
export const AGENT_PROMPT_SUBMIT = '\r'

const DEFAULT_AGENT_PROMPT_SUBMIT_DELAY_MS = 500
const WINDOWS_AGENT_PROMPT_SUBMIT_DELAY_MS = 1_500

// Why: ConPTY renders long bracketed pastes more slowly; an early Enter leaves the task in the agent input buffer.
export function getAgentPromptSubmitDelayMs(platform: NodeJS.Platform): number {
  return platform === 'win32'
    ? WINDOWS_AGENT_PROMPT_SUBMIT_DELAY_MS
    : DEFAULT_AGENT_PROMPT_SUBMIT_DELAY_MS
}

export const AGENT_PROMPT_SUBMIT_DELAY_MS = getAgentPromptSubmitDelayMs(process.platform)

// Why: the submit delay only spaces Orca's two writes. Every provider write is
// unacknowledged (node-pty queue / daemon notify / relay `pty.data`), so a TUI
// that is mid-render when the frame lands drains ESC[201~ and the CR out of the
// pty buffer in one read() and folds the CR into the paste — the prompt stays
// in the composer, unsubmitted. Render output after the frame is the only
// evidence the TUI actually consumed it; these bound that wait.
export const AGENT_PROMPT_PASTE_QUIET_MS = 250
export const AGENT_PROMPT_PASTE_SETTLE_TIMEOUT_MS = 6_000

// Why: a TUI that stays silent past the settle cap can still absorb the Enter,
// so the submit is verified once the post-Enter render has settled. Shorter
// floor than the paste settle: we are waiting on one keypress being echoed, not
// on a multi-KB frame being laid out.
export const AGENT_PROMPT_SUBMIT_VERIFY_FLOOR_MS = 600

// Why: a just-launched worker has no status evidence yet — its hooks have not
// fired and its idle title is not painted — so a single check lands in that
// blind window, returns "cannot tell", and the rescue never fires on exactly
// the dispatch that needs it. Re-check while the verdict stays indeterminate.
export const AGENT_PROMPT_SUBMIT_VERIFY_ATTEMPTS = 3

const ESCAPE = '\x1b'
const INERT_ESCAPE = '<ESC>'

export function sanitizeAgentPromptText(text: string): string {
  let escapeIndex = text.indexOf(ESCAPE)
  if (escapeIndex === -1) {
    return text
  }

  let sanitized = ''
  let start = 0
  while (escapeIndex !== -1) {
    sanitized += `${text.slice(start, escapeIndex)}${INERT_ESCAPE}`
    start = escapeIndex + ESCAPE.length
    escapeIndex = text.indexOf(ESCAPE, start)
  }
  return sanitized + text.slice(start)
}

export function buildAgentPromptPasteBytes(prompt: string): string {
  return `${AGENT_PROMPT_BRACKETED_PASTE_START}${sanitizeAgentPromptText(prompt)}${AGENT_PROMPT_BRACKETED_PASTE_END}`
}

export function buildAgentPromptSubmitBytes(): string {
  return AGENT_PROMPT_SUBMIT
}

export function* iterateAgentPromptPasteChunks(
  prompt: string,
  maxChunkBytes = TERMINAL_INPUT_CHUNK_MAX_BYTES
): Generator<string> {
  yield* iterateTerminalInputChunks(buildAgentPromptPasteBytes(prompt), maxChunkBytes)
}

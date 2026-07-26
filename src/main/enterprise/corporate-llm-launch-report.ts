// Single import surface for the PTY spawn path, so the upstream file gains one
// import line instead of two and the fork's rebase surface stays minimal.

import {
  applyCorporateLlmSelection,
  describeCorporateLlmSelection,
  type CorporateLlmSelection
} from './corporate-llm-launch-injection'

export { applyCorporateLlmSelection }
export type { CorporateLlmSelection }

// Bounded: one line per distinct outcome, not one per launch — an agent that
// respawns in a loop must not fill the log with the same notice.
const reported = new Set<string>()
const MAX_REPORTED = 32

/**
 * Tell the operator what happened, once per distinct outcome. A misconfigured
 * selection is otherwise invisible: the agent simply keeps its previous backend.
 */
export function reportCorporateLlmSelection(selection: CorporateLlmSelection): void {
  const message = describeCorporateLlmSelection(selection)
  if (!message || reported.has(message)) {
    return
  }
  if (reported.size < MAX_REPORTED) {
    reported.add(message)
  }
  process.stderr.write(`[corporate-llm] ${message}\n`)
}

/** Exposed for tests only — clears the one-shot dedupe between cases. */
export function resetCorporateLlmReportForTests(): void {
  reported.clear()
}

// Why: the session search index copies agent transcripts into SQLite. Corporate retention keeps
// that copy for at most two weeks, whatever an agent keeps on disk and whatever the setting asks
// for — "all history" included. Reuse restarts a transcript's window instead of widening this one
// (src/main/ai-vault-search/session-search-reuse.ts).
//
// Annotated `number | null` so the suite can lift the cap for upstream's own retention cases
// (config/vitest-session-search-retention-isolation.ts); null means no fork cap.
export const SESSION_SEARCH_MAX_HISTORY_DAYS: number | null = 14

/** The window actually applied: never wider than the cap, and "all history" becomes the cap. */
export function capSessionSearchHistoryDays(days: number | null): number | null {
  const max = SESSION_SEARCH_MAX_HISTORY_DAYS
  if (max === null) {
    return days
  }
  return days === null ? max : Math.min(days, max)
}

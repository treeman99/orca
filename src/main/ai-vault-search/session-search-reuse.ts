import type SyncDatabase from '../sqlite/sync-database'

// Why: corporate retention keeps an indexed transcript for two weeks
// (src/shared/session-search-retention-cap.ts), and taking a past session up again — resuming it,
// continuing it, copying its prompt — restarts that transcript's two weeks from that moment.
// Retention compares a transcript's mtime with the cutoff; a reuse is the second clock, so every
// retention decision keeps a transcript whose reuse is inside the window even when its mtime is not.
//
// A table of its own rather than a column on `files`: rows here outlive a purge that removed the
// file's rows, which is what lets a reuse bring an expired transcript back into the index. Pruned by
// the same purge once the reuse itself falls out of the window.
const REUSE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS session_search_reuse(
  path TEXT PRIMARY KEY,
  reused_at_ms REAL NOT NULL
)`

/** Predicate over `files`: this transcript was reused inside the window. Binds the cutoff once. */
export const SESSION_SEARCH_REUSED_SINCE_SQL =
  'path IN (SELECT path FROM session_search_reuse WHERE reused_at_ms >= ?)'

export function ensureSessionSearchReuseTable(db: SyncDatabase): void {
  db.exec(REUSE_TABLE_SQL)
}

/** Stamps each path reused at `nowMs`; a later stamp never moves back. */
export function recordSessionSearchReuse(
  db: SyncDatabase,
  paths: readonly string[],
  nowMs: number
): void {
  const upsert = db.prepare(
    `INSERT INTO session_search_reuse(path, reused_at_ms) VALUES (?, ?)
     ON CONFLICT(path) DO UPDATE SET reused_at_ms = max(reused_at_ms, excluded.reused_at_ms)`
  )
  for (const path of paths) {
    upsert.run(path, nowMs)
  }
}

export function sessionSearchReusedPaths(db: SyncDatabase, cutoffMs: number): Set<string> {
  const rows = db
    .prepare('SELECT path FROM session_search_reuse WHERE reused_at_ms >= ?')
    .all(cutoffMs) as { path: string }[]
  return new Set(rows.map((row) => row.path))
}

export function isSessionSearchPathReused(
  db: SyncDatabase,
  path: string,
  cutoffMs: number
): boolean {
  return (
    db
      .prepare('SELECT 1 AS reused FROM session_search_reuse WHERE path = ? AND reused_at_ms >= ?')
      .get(path, cutoffMs) !== undefined
  )
}

/** Drops stamps the window has passed; they can no longer keep anything. */
export function pruneSessionSearchReuse(db: SyncDatabase, cutoffMs: number): void {
  db.prepare('DELETE FROM session_search_reuse WHERE reused_at_ms < ?').run(cutoffMs)
}

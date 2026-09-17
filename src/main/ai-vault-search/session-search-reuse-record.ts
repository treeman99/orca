import { openSessionSearchDatabase } from './session-search-schema'
import { recordSessionSearchReuse } from './session-search-reuse'

const MAX_REUSE_PATHS = 64
const MAX_REUSE_PATH_LENGTH = 4096

/**
 * Stamps reuse from the process that owns the index (the scanner child). A connection of its own
 * rather than the live indexer's: the stamp is one small upsert, WAL admits it beside the indexer's
 * handle, and the indexer stays immutable. Only called while an index is live, so it never creates
 * a database nobody consented to.
 */
export function recordSessionSearchReuseInDatabase(
  databasePath: string,
  paths: unknown,
  nowMs: number
): void {
  const valid = Array.isArray(paths)
    ? paths
        .filter(
          (path): path is string =>
            typeof path === 'string' && path.length > 0 && path.length <= MAX_REUSE_PATH_LENGTH
        )
        .slice(0, MAX_REUSE_PATHS)
    : []
  if (valid.length === 0) {
    return
  }
  const db = openSessionSearchDatabase(databasePath)
  try {
    recordSessionSearchReuse(db, valid, nowMs)
  } finally {
    db.close()
  }
}

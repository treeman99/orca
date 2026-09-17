import { existsSync } from 'node:fs'
import { utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { resetSessionParseCacheForTests } from '../ai-vault/session-scanner-parse-cache'
import { SessionScannerServiceSearch } from '../ai-vault/session-scanner-service-search'
import { resetTranscriptConsumersForTests } from '../ai-vault/session-transcript-consumers'
import SyncDatabase from '../sqlite/sync-database'
import { SessionSearchIndexer } from './session-search-indexer'
import {
  FakeSessionSearchClock,
  openSessionSearchIndexerHarness,
  writeClaudeTranscript,
  type SessionSearchIndexerHarness
} from './session-search-indexer-test-fixture'
import { recordSessionSearchReuse } from './session-search-reuse'
import { markAiVaultSessionReused } from './session-search-reuse-request'
import { sessionRowFilter } from './session-search-row-filter'

// Why: the suite lifts the two-week cap (config/vitest-session-search-retention-isolation.ts); these
// cases run the retention this build ships.
vi.unmock('../../shared/session-search-retention-cap')

const DAY_MS = 86_400_000
const KEPT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const DROPPED = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'

let harness: SessionSearchIndexerHarness
let clock: FakeSessionSearchClock
let indexer: SessionSearchIndexer | null

beforeEach(async () => {
  resetSessionParseCacheForTests()
  resetTranscriptConsumersForTests()
  clock = new FakeSessionSearchClock()
  harness = await openSessionSearchIndexerHarness('ss-reuse')
  indexer = null
})

afterEach(async () => {
  indexer?.close()
  resetTranscriptConsumersForTests()
  resetSessionParseCacheForTests()
  await harness.cleanup()
})

function newIndexer(): SessionSearchIndexer {
  // historyDays: null is "all history" upstream; the shipped cap turns it into two weeks.
  indexer = new SessionSearchIndexer({
    databasePath: harness.databasePath,
    roots: harness.roots,
    historyDays: null,
    clock,
    onError: (error) => {
      throw error
    }
  })
  return indexer
}

function transcriptPath(sessionId: string): string {
  return join(harness.claudeProjectDir, `${sessionId}.jsonl`)
}

async function writeTranscriptAged(sessionId: string, term: string, ageDays: number) {
  const path = transcriptPath(sessionId)
  await writeClaudeTranscript(path, [term], sessionId)
  const at = new Date(clock.now() - ageDays * DAY_MS)
  await utimes(path, at, at)
  return path
}

function sessionsMatching(term: string): string[] {
  return harness.read((db: SyncDatabase) =>
    (
      db
        .prepare(
          `SELECT DISTINCT s.session_id AS id FROM messages_fts
           JOIN messages m ON m.id = messages_fts.rowid
           JOIN sessions s ON s.id = m.session_row_id
           WHERE messages_fts MATCH ? ORDER BY s.session_id`
        )
        .all(term) as { id: string }[]
    ).map((row) => row.id)
  )
}

function sessionRowId(sessionId: string): number | null {
  return harness.read(
    (db: SyncDatabase) =>
      (
        db.prepare('SELECT id FROM sessions WHERE session_id = ?').get(sessionId) as
          | { id: number }
          | undefined
      )?.id ?? null
  )
}

function reuseStamps(): number {
  return harness.read(
    (db: SyncDatabase) =>
      (db.prepare('SELECT count(*) AS n FROM session_search_reuse').get() as { n: number }).n
  )
}

async function fullSweepAfter(days: number): Promise<void> {
  clock.advance(days * DAY_MS)
  await indexer?.settled()
  await indexer?.reconcile({ full: true })
}

it('drops a transcript two weeks after its last change unless it was reused', async () => {
  const kept = await writeTranscriptAged(KEPT, 'keptterm', 10)
  await writeTranscriptAged(DROPPED, 'droppedterm', 10)
  await newIndexer().start()
  expect(sessionsMatching('keptterm')).toEqual([KEPT])
  expect(sessionsMatching('droppedterm')).toEqual([DROPPED])

  // Day 11: the kept transcript is reused, so its two weeks restart here.
  clock.advance(DAY_MS)
  harness.write((db) => recordSessionSearchReuse(db, [kept], clock.now()))

  // Day 15: both transcripts are older than two weeks; only the reuse keeps one — in place, not
  // purged and re-read, which would churn the FTS index every sweep.
  const keptRowBefore = sessionRowId(KEPT)
  await fullSweepAfter(4)
  expect(sessionsMatching('keptterm')).toEqual([KEPT])
  expect(sessionsMatching('droppedterm')).toEqual([])
  expect(sessionRowId(KEPT)).toBe(keptRowBefore)

  // Day 26: two weeks after the reuse, it goes too, and so does the spent stamp.
  await fullSweepAfter(11)
  expect(sessionsMatching('keptterm')).toEqual([])
  expect(reuseStamps()).toBe(0)
})

it('brings an expired transcript back into the index from the moment it is reused', async () => {
  const path = await writeTranscriptAged(KEPT, 'revivedterm', 20)
  await newIndexer().start()
  expect(sessionsMatching('revivedterm')).toEqual([])

  harness.write((db) => recordSessionSearchReuse(db, [path], clock.now()))
  await indexer?.reconcile({ full: true })
  expect(sessionsMatching('revivedterm')).toEqual([KEPT])

  // Search itself answers for it: the retention filter keeps a reused row past the mtime cutoff.
  const cutoff = clock.now() - 14 * DAY_MS
  const filter = sessionRowFilter({}, cutoff)
  const answered = harness.read((db: SyncDatabase) =>
    (
      db
        .prepare(`SELECT session_id AS id FROM sessions WHERE ${filter.conditions.join(' AND ')}`)
        .all(...filter.values) as { id: string }[]
    ).map((row) => row.id)
  )
  expect(answered).toEqual([KEPT])
})

it('stamps reuse in the index child only while an index is live', async () => {
  const path = await writeTranscriptAged(KEPT, 'childterm', 1)
  const databasePath = join(harness.root, 'child', 'session-search.sqlite')
  const child = new SessionScannerServiceSearch()
  try {
    child.apply({
      databasePath,
      roots: harness.roots,
      settings: { enabled: false, historyDays: null }
    })
    await child.execute({ type: 'request', id: 1, operation: 'searchMarkReused', paths: [path] })
    expect(existsSync(databasePath)).toBe(false)

    child.apply({
      databasePath,
      roots: harness.roots,
      settings: { enabled: true, historyDays: null }
    })
    await child.execute({ type: 'request', id: 2, operation: 'searchMarkReused', paths: [path] })
    const db = new SyncDatabase(databasePath, { readonly: true })
    try {
      expect(db.prepare('SELECT path FROM session_search_reuse').all()).toEqual([{ path }])
    } finally {
      db.close()
    }
  } finally {
    child.close()
  }
})

it('forwards only a local reuse, and only while session search is on', async () => {
  const mark = vi.fn(async () => undefined)
  const on = { mark, enabled: () => true }

  await markAiVaultSessionReused({ filePath: '/t/a.jsonl', executionHostId: 'local' }, on)
  await markAiVaultSessionReused({ filePath: '/t/b.jsonl' }, on)
  expect(mark.mock.calls).toEqual([[['/t/a.jsonl']], [['/t/b.jsonl']]])

  mark.mockClear()
  await markAiVaultSessionReused({ filePath: '/t/c.jsonl', executionHostId: 'ssh:box' }, on)
  await markAiVaultSessionReused({ filePath: '/t/c.jsonl', executionHostId: 'runtime:env' }, on)
  await markAiVaultSessionReused({ filePath: '  ' }, on)
  await markAiVaultSessionReused(null, on)
  await markAiVaultSessionReused({ filePath: '/t/d.jsonl' }, { mark, enabled: () => false })
  expect(mark).not.toHaveBeenCalled()
})

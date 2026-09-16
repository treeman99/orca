import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { resolveAiVaultSearchSettings } from '../../shared/ai-vault-search-settings'
import { SESSION_SEARCH_INDEX_BLOCKED } from '../../shared/session-search-index-block'
import { resetSessionParseCacheForTests } from '../ai-vault/session-scanner-parse-cache'
import { resetTranscriptConsumersForTests } from '../ai-vault/session-transcript-consumers'
import {
  openSessionSearchIndexerHarness,
  type SessionSearchIndexerHarness
} from './session-search-indexer-test-fixture'
import { SessionSearchInstance } from './session-search-instance'
import { resetSessionSearchPolicyForTests } from './session-search-policy'
import { resetSessionSearchServiceInitForTests } from './session-search-service-init'
import { searchSessionService, setSessionSearchService } from './session-search-service-registry'

// Why: config/vitest-session-search-index-block-isolation.ts lifts the block for the whole suite so
// upstream's index cases keep running. This file is the one that runs the build as shipped.
vi.unmock('../../shared/session-search-index-block')

const updateSessionSearchInService = vi.hoisted(() => vi.fn())
vi.mock('../ai-vault/session-scanner-service-spawn', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateSessionSearchInService
}))

const localAiVaultScanRoots = vi.hoisted(() => vi.fn())
vi.mock('../ai-vault/cached-session-list', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  localAiVaultScanRoots
}))

const OPTED_IN = { aiVaultSearch: { enabled: true, historyDays: 30 } }

let harness: SessionSearchIndexerHarness
let installed: { dispose(): void } | null

beforeEach(async () => {
  resetSessionParseCacheForTests()
  resetTranscriptConsumersForTests()
  updateSessionSearchInService.mockClear()
  harness = await openSessionSearchIndexerHarness('ss-index-block')
  installed = null
  localAiVaultScanRoots.mockReset().mockResolvedValue(harness.roots)
})

afterEach(async () => {
  installed?.dispose()
  setSessionSearchService(null)
  resetSessionSearchPolicyForTests()
  resetSessionSearchServiceInitForTests()
  resetTranscriptConsumersForTests()
  resetSessionParseCacheForTests()
  await harness.cleanup()
})

it('ships with the index blocked', () => {
  // Also proves the unmock took: every case below is meaningless if the suite-wide lift leaked in.
  expect(SESSION_SEARCH_INDEX_BLOCKED).toBe(true)
})

it('resolves a stored or written opt-in to off and keeps the retention bound', () => {
  expect(resolveAiVaultSearchSettings(OPTED_IN)).toEqual({ enabled: false, historyDays: 30 })
})

it('pushes an off policy to the desktop scanner child even when the setting says on', async () => {
  const { installChildSessionSearchService } = await import('./session-search-enablement')
  installed = installChildSessionSearchService({
    dataRoot: harness.root,
    getSettings: () => OPTED_IN
  })
  await vi.waitFor(() => expect(updateSessionSearchInService).toHaveBeenCalledTimes(1))
  expect(updateSessionSearchInService.mock.calls[0]?.[0]).toMatchObject({
    settings: { enabled: false, historyDays: 30 }
  })
})

it('builds no orcad index and never creates its database file', async () => {
  const { installOrcadSessionSearchService } = await import('../orcad/orcad-session-search')
  installed = await installOrcadSessionSearchService({
    userDataPath: harness.root,
    getSettings: () => OPTED_IN
  })
  expect(await searchSessionService({ query: 'ledger' }, 'ipc')).toEqual({
    kind: 'unavailable',
    reason: 'disabled'
  })
  expect(localAiVaultScanRoots).not.toHaveBeenCalled()
  expect(existsSync(join(harness.root, 'ai-vault', 'session-search.sqlite'))).toBe(false)
})

it('refuses to build an index for a caller that bypasses the settings resolver', () => {
  const instance = new SessionSearchInstance({
    databasePath: harness.databasePath,
    roots: harness.roots
  })
  try {
    instance.apply({ enabled: true, historyDays: null })
    expect(instance.running).toBe(false)
    expect(existsSync(harness.databasePath)).toBe(false)
  } finally {
    instance.close()
  }
})

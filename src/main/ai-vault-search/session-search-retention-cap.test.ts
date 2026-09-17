import { expect, it, vi } from 'vitest'
import { sessionSearchHistoryCutoffMs } from './session-search-retention-policy'
import {
  DEFAULT_AI_VAULT_SEARCH_SETTINGS,
  resolveAiVaultSearchSettings
} from '../../shared/ai-vault-search-settings'
import { SESSION_SEARCH_MAX_HISTORY_DAYS } from '../../shared/session-search-retention-cap'

// Why: config/vitest-session-search-retention-isolation.ts lifts the cap for the whole suite so
// upstream's retention cases keep running. This file runs the build as shipped.
vi.unmock('../../shared/session-search-retention-cap')

const DAY_MS = 86_400_000

it('ships with a two-week cap', () => {
  // Also proves the unmock took: every case below is meaningless if the suite-wide lift leaked in.
  expect(SESSION_SEARCH_MAX_HISTORY_DAYS).toBe(14)
  expect(DEFAULT_AI_VAULT_SEARCH_SETTINGS.historyDays).toBe(14)
})

it.each([
  ['a profile with no search settings', undefined, 14],
  ['all history', null, 14],
  ['a month', 30, 14],
  ['the widest upstream window', 3650, 14],
  ['exactly two weeks', 14, 14],
  ['a narrower week', 7, 7],
  ['one day', 1, 1],
  ['a fractional day', 0.5, 14],
  ['a negative count', -3, 14]
])('resolves %s to a window of at most two weeks', (_label, historyDays, expected) => {
  const settings =
    historyDays === undefined ? {} : { aiVaultSearch: { enabled: true, historyDays } }
  expect(resolveAiVaultSearchSettings(settings).historyDays).toBe(expected)
})

it('never computes a cutoff older than two weeks, whatever the caller passes', () => {
  const now = 1_800_000_000_000
  expect(sessionSearchHistoryCutoffMs(null, now)).toBe(now - 14 * DAY_MS)
  expect(sessionSearchHistoryCutoffMs(365, now)).toBe(now - 14 * DAY_MS)
  expect(sessionSearchHistoryCutoffMs(7, now)).toBe(now - 7 * DAY_MS)
})

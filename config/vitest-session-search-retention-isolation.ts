import { vi } from 'vitest'

// Why: this build caps session search retention at two weeks
// (src/shared/session-search-retention-cap.ts), so "all history" and any wider window resolve to
// 14 days. Upstream's own retention cases assert the uncapped windows, and every sync would have
// to re-edit them. The suite runs with the cap lifted; session-search-retention-cap.test.ts and
// session-search-reuse-retention.test.ts unmock it and prove the shipped behaviour.
vi.mock('../src/shared/session-search-retention-cap', () => ({
  SESSION_SEARCH_MAX_HISTORY_DAYS: null,
  capSessionSearchHistoryDays: (days: number | null) => days
}))

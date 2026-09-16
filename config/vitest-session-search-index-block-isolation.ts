import { vi } from 'vitest'

// Why: this build hard-blocks the agent session search index (src/shared/session-search-index-block.ts).
// Upstream's own cases turn the index on to test it; with the block live, ~18 of them fail for a
// reason no upstream diff explains, and every sync would have to re-edit them. The suite runs with
// the block lifted, so upstream logic stays tested for the day the review lets the feature back
// in. session-search-index-block.test.ts unmocks it and proves the build refuses.
vi.mock('../src/shared/session-search-index-block', () => ({
  SESSION_SEARCH_INDEX_BLOCKED: false
}))

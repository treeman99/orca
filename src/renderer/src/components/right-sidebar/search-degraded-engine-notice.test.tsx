// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SearchResult } from '../../../../shared/code-search-types'
import { SearchDegradedEngineNotice } from './search-degraded-engine-notice'

function result(overrides: Partial<SearchResult>): SearchResult {
  return { files: [], totalMatches: 0, truncated: false, ...overrides }
}

describe('SearchDegradedEngineNotice', () => {
  it('warns when the git-grep fallback produced the results', () => {
    render(<SearchDegradedEngineNotice results={result({ engine: 'git-grep' })} />)

    expect(screen.getByText(/ripgrep/)).toBeTruthy()
  })

  it('names the submodules the fallback could not search', () => {
    render(
      <SearchDegradedEngineNotice
        results={result({ engine: 'git-grep', skippedSubmodules: ['vendor/libalpha'] })}
      />
    )

    expect(screen.getByText(/vendor\/libalpha/)).toBeTruthy()
  })

  it('stays silent for a ripgrep search', () => {
    const { container } = render(
      <SearchDegradedEngineNotice results={result({ engine: 'ripgrep' })} />
    )

    expect(container.innerHTML).toBe('')
  })

  // Why: a remote host predating the `engine` field sends nothing, and the panel
  // must not accuse it of a degraded search (remote-wire-compatibility Rule 1).
  it('stays silent when the host omitted the engine field', () => {
    const { container } = render(<SearchDegradedEngineNotice results={result({})} />)

    expect(container.innerHTML).toBe('')
  })

  it('stays silent before any search has run', () => {
    const { container } = render(<SearchDegradedEngineNotice results={null} />)

    expect(container.innerHTML).toBe('')
  })
})

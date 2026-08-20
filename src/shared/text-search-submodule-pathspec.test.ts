import { describe, expect, it } from 'vitest'
import { translateSearchPatternsIntoSubmodule } from './text-search-submodule-pathspec'

const SUB = 'vendor/libalpha'

describe('translateSearchPatternsIntoSubmodule', () => {
  it('searches with no filters at all', () => {
    expect(translateSearchPatternsIntoSubmodule({}, SUB)).toEqual({ kind: 'search' })
  })

  it('passes a bare glob through — it is recursive under either root', () => {
    expect(translateSearchPatternsIntoSubmodule({ includePattern: '*.ts' }, SUB)).toEqual({
      kind: 'search',
      includePattern: '*.ts'
    })
  })

  it('passes a depth-agnostic glob through', () => {
    expect(translateSearchPatternsIntoSubmodule({ excludePattern: '**/dist/**' }, SUB)).toEqual({
      kind: 'search',
      excludePattern: '**/dist/**'
    })
  })

  it('strips the submodule prefix off a glob rooted at it', () => {
    expect(
      translateSearchPatternsIntoSubmodule({ includePattern: 'vendor/libalpha/src/*.ts' }, SUB)
    ).toEqual({ kind: 'search', includePattern: 'src/*.ts' })
  })

  it('skips without degrading when every include glob is rooted elsewhere', () => {
    expect(translateSearchPatternsIntoSubmodule({ includePattern: 'src/**' }, SUB)).toEqual({
      kind: 'skip',
      degraded: false
    })
  })

  it('skips without degrading for a sibling submodule glob', () => {
    expect(
      translateSearchPatternsIntoSubmodule({ includePattern: 'vendor/libbeta/*.ts' }, SUB)
    ).toEqual({ kind: 'skip', degraded: false })
  })

  it('drops an exclude glob that provably cannot match inside the submodule', () => {
    expect(
      translateSearchPatternsIntoSubmodule({ excludePattern: 'src/generated/**' }, SUB)
    ).toEqual({ kind: 'search', excludePattern: undefined })
  })

  it('degrades rather than guess when a wildcard sits above the submodule', () => {
    expect(
      translateSearchPatternsIntoSubmodule({ includePattern: 'vendor/*/code.ts' }, SUB)
    ).toEqual({ kind: 'skip', degraded: true })
  })

  it('degrades on an untranslatable exclude so a filtered file cannot leak back in', () => {
    expect(translateSearchPatternsIntoSubmodule({ excludePattern: 'vendor/**' }, SUB)).toEqual({
      kind: 'skip',
      degraded: true
    })
  })

  it('keeps translatable globs from a mixed list and drops the unrelated ones', () => {
    expect(
      translateSearchPatternsIntoSubmodule(
        { includePattern: '*.ts,src/**,vendor/libalpha/docs/*.md' },
        SUB
      )
    ).toEqual({ kind: 'search', includePattern: '*.ts,docs/*.md' })
  })

  it('degrades when any glob in the list is untranslatable', () => {
    expect(
      translateSearchPatternsIntoSubmodule({ includePattern: '*.ts,vendor/*/code.ts' }, SUB)
    ).toEqual({ kind: 'skip', degraded: true })
  })

  it('refuses a glob that names the submodule root itself', () => {
    expect(
      translateSearchPatternsIntoSubmodule({ includePattern: 'vendor/libalpha/' }, SUB)
    ).toEqual({ kind: 'skip', degraded: true })
  })
})

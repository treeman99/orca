import { describe, expect, it } from 'vitest'
import type { GitStatusEntry } from '../../../../shared/types'
import en from '@/i18n/locales/en.json'
import es from '@/i18n/locales/es.json'
import ja from '@/i18n/locales/ja.json'
import ko from '@/i18n/locales/ko.json'
import zh from '@/i18n/locales/zh.json'
import {
  getSubmoduleCommitRangeLabel,
  getSubmoduleCommitRangeTooltip,
  getSubmoduleRowStateLabel
} from './source-control-submodule-state-label'

function gitlinkRow(submodule: GitStatusEntry['submodule']): GitStatusEntry {
  return { path: 'vendor/sub', status: 'modified', area: 'unstaged', submodule }
}

describe('getSubmoduleRowStateLabel', () => {
  it('says "new commits" for a pointer left behind by checkout, like git status does', () => {
    // Why this row exists at all: `git checkout` never rewinds a submodule worktree,
    // so the drift belongs to whoever pushed — the label is what says so.
    expect(
      getSubmoduleRowStateLabel(
        gitlinkRow({ commitChanged: true, trackedChanges: false, untrackedChanges: false })
      )
    ).toBe('new commits')
  })

  it('joins every signal in git status order', () => {
    expect(
      getSubmoduleRowStateLabel(
        gitlinkRow({ commitChanged: true, trackedChanges: true, untrackedChanges: true })
      )
    ).toBe('new commits, modified content, untracked content')
  })

  it('labels nothing for an ordinary file or for a row inside a submodule', () => {
    expect(
      getSubmoduleRowStateLabel({ path: 'a.txt', status: 'modified', area: 'unstaged' })
    ).toBeNull()
    expect(
      getSubmoduleRowStateLabel({
        ...gitlinkRow({ commitChanged: true, trackedChanges: false, untrackedChanges: false }),
        path: 'vendor/sub/inner.txt',
        submoduleRoot: 'vendor/sub'
      })
    ).toBeNull()
  })
})

describe('getSubmoduleCommitRangeLabel', () => {
  it('marks a recorded-gitlink→checkout row as already committed', () => {
    expect(
      getSubmoduleCommitRangeLabel({
        path: 'vendor/sub/pulled-a.txt',
        status: 'added',
        area: 'unstaged',
        submoduleRoot: 'vendor/sub',
        submoduleCommitRange: true
      })
    ).toBe('committed in submodule')
  })

  it('serves the row tooltip from the catalog in every shipped locale', () => {
    // Why pin this: the tooltip started life as a module-scope const in
    // SourceControl.tsx, which the coverage auditor never classifies — it only
    // inspects literals inside JSX attributes, object properties and calls. The
    // gate stayed green while the string rendered untranslated English next to a
    // sub-label this same feature had translated five ways.
    const key = 'sourceControl.submoduleCommitRangeTooltip'
    const catalogs: Record<string, { sourceControl?: Record<string, string> }> = {
      en,
      es,
      ja,
      ko,
      zh
    }

    for (const [locale, catalog] of Object.entries(catalogs)) {
      const value = catalog.sourceControl?.submoduleCommitRangeTooltip
      expect(value, `${key} missing from ${locale}.json`).toBeTruthy()
    }
    expect(getSubmoduleCommitRangeTooltip()).toBe(en.sourceControl.submoduleCommitRangeTooltip)
  })

  it('leaves the user own uncommitted edit unlabelled', () => {
    expect(
      getSubmoduleCommitRangeLabel({
        path: 'vendor/sub/subfile.txt',
        status: 'modified',
        area: 'unstaged',
        submoduleRoot: 'vendor/sub'
      })
    ).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import type { GitStatusEntry } from '../../../../shared/types'
import {
  getSubmoduleCommitRangeLabel,
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

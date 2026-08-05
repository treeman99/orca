import { describe, expect, it } from 'vitest'
import type { GitStatusEntry } from '../../../../shared/types'
import { getSubmoduleRowStateLabel } from './source-control-submodule-state-label'

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

  it('labels nothing for an ordinary file', () => {
    expect(
      getSubmoduleRowStateLabel({ path: 'a.txt', status: 'modified', area: 'unstaged' })
    ).toBeNull()
  })
})

// Why: `git status` annotates a gitlink at any depth. Gating the label on `submoduleRoot`
// dropped it for a submodule nested inside an expanded one, which now shows that folder's
// status verbatim and so would have carried a bare, unexplained path.
describe('nested gitlink rows', () => {
  it('labels a gitlink that lives inside an expanded submodule', () => {
    const nested: GitStatusEntry = {
      path: 'vendor/sub/inner',
      status: 'modified',
      area: 'unstaged',
      submoduleRoot: 'vendor/sub',
      submodule: { commitChanged: true, trackedChanges: false, untrackedChanges: false }
    }

    expect(getSubmoduleRowStateLabel(nested)).toBe('new commits')
  })

  it('stays null for an ordinary file inside a submodule', () => {
    const inner: GitStatusEntry = {
      path: 'vendor/sub/a.txt',
      status: 'modified',
      area: 'unstaged',
      submoduleRoot: 'vendor/sub'
    }

    expect(getSubmoduleRowStateLabel(inner)).toBeNull()
  })
})

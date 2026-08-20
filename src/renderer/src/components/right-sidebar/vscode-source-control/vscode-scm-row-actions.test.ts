import { describe, expect, it } from 'vitest'
import { isVscodeScmPointerRestoreRow, resolveVscodeScmRowActions } from './vscode-scm-row-actions'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'

function entry(partial: Partial<GitStatusEntry> & Pick<GitStatusEntry, 'path'>): GitStatusEntry {
  return { status: 'modified', area: 'unstaged', ...partial }
}

const MOVED = { commitChanged: true, trackedChanges: false, untrackedChanges: false }
const DIRTY_ONLY = { commitChanged: false, trackedChanges: true, untrackedChanges: false }

describe('isVscodeScmPointerRestoreRow', () => {
  it('accepts a parent gitlink whose recorded pointer actually moved', () => {
    expect(
      isVscodeScmPointerRestoreRow(entry({ path: 'vendor/a', submodule: MOVED }), 'parent')
    ).toBe(true)
  })

  // `git submodule update` does not touch the submodule's working tree, so a submodule that
  // is only dirty inside would get a button that reports success and changes nothing.
  it('refuses a submodule that is merely dirty inside', () => {
    expect(
      isVscodeScmPointerRestoreRow(entry({ path: 'vendor/a', submodule: DIRTY_ONLY }), 'parent')
    ).toBe(false)
  })

  it('refuses a gitlink nested inside a submodule section', () => {
    expect(
      isVscodeScmPointerRestoreRow(entry({ path: 'inner', submodule: MOVED }), 'submodule')
    ).toBe(false)
    expect(
      isVscodeScmPointerRestoreRow(
        entry({ path: 'vendor/a/inner', submodule: MOVED, submoduleRoot: 'vendor/a' }),
        'parent'
      )
    ).toBe(false)
  })

  it('refuses a staged pointer, a conflicted one, and a commit-range row', () => {
    expect(
      isVscodeScmPointerRestoreRow(
        entry({ path: 'vendor/a', area: 'staged', submodule: MOVED }),
        'parent'
      )
    ).toBe(false)
    expect(
      isVscodeScmPointerRestoreRow(
        entry({ path: 'vendor/a', submodule: MOVED, conflictStatus: 'unresolved' }),
        'parent'
      )
    ).toBe(false)
    expect(
      isVscodeScmPointerRestoreRow(
        entry({ path: 'vendor/a', submodule: MOVED, submoduleCommitRange: true }),
        'parent'
      )
    ).toBe(false)
  })

  it('refuses an ordinary file', () => {
    expect(isVscodeScmPointerRestoreRow(entry({ path: 'src/app.ts' }), 'parent')).toBe(false)
  })
})

describe('resolveVscodeScmRowActions', () => {
  it('offers discard and stage for an ordinary working-tree file', () => {
    expect(
      resolveVscodeScmRowActions(entry({ path: 'src/app.ts' }), 'workingTree', 'submodule')
    ).toEqual(['discard', 'stage'])
  })

  it('offers only unstage in the staged group', () => {
    expect(
      resolveVscodeScmRowActions(entry({ path: 'src/app.ts', area: 'staged' }), 'index', 'parent')
    ).toEqual(['unstage'])
  })

  it('adds discard to a parent gitlink row, which the shared predicate refuses', () => {
    const gitlink = entry({ path: 'vendor/a', submodule: MOVED })
    expect(resolveVscodeScmRowActions(gitlink, 'workingTree', 'parent')).toContain('discard')
    expect(resolveVscodeScmRowActions(gitlink, 'workingTree', 'submodule')).not.toContain('discard')
  })
})

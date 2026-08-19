import { describe, expect, it } from 'vitest'
import { resolveSubmoduleDiscardTarget } from './source-control-submodule-discard-target'
import type { GitStatusEntry } from '../../../../shared/git-status-types'

function entry(overrides: Partial<GitStatusEntry>): GitStatusEntry {
  return { path: 'vendor/sub/a.txt', status: 'modified', area: 'unstaged', ...overrides }
}

describe('resolveSubmoduleDiscardTarget', () => {
  it('splits a child row into the submodule and its own relative path', () => {
    expect(resolveSubmoduleDiscardTarget(entry({ submoduleRoot: 'vendor/sub' }))).toEqual({
      submodulePath: 'vendor/sub',
      innerPath: 'a.txt'
    })
  })

  it('keeps nested inner paths intact', () => {
    expect(
      resolveSubmoduleDiscardTarget(
        entry({ path: 'vendor/sub/src/deep/a.txt', submoduleRoot: 'vendor/sub' })
      )
    ).toEqual({ submodulePath: 'vendor/sub', innerPath: 'src/deep/a.txt' })
  })

  it('is null for a row that is not inside a submodule', () => {
    expect(resolveSubmoduleDiscardTarget(entry({ path: 'a.txt' }))).toBeNull()
  })

  it('is null when the row path does not actually sit under its submodule', () => {
    expect(
      resolveSubmoduleDiscardTarget(entry({ path: 'other/a.txt', submoduleRoot: 'vendor/sub' }))
    ).toBeNull()
    // A sibling whose name merely starts with the submodule path.
    expect(
      resolveSubmoduleDiscardTarget(
        entry({ path: 'vendor/subx/a.txt', submoduleRoot: 'vendor/sub' })
      )
    ).toBeNull()
  })

  it('is null for the submodule root itself, which is not a file to discard', () => {
    expect(
      resolveSubmoduleDiscardTarget(entry({ path: 'vendor/sub', submoduleRoot: 'vendor/sub' }))
    ).toBeNull()
    expect(
      resolveSubmoduleDiscardTarget(entry({ path: 'vendor/sub/', submoduleRoot: 'vendor/sub' }))
    ).toBeNull()
  })

  // The reason this check is segment-wise: a leading-dot test would pass this through and
  // git would resolve it two levels above the submodule, inside the parent worktree.
  it('refuses a traversal hidden after a normal segment', () => {
    expect(
      resolveSubmoduleDiscardTarget(
        entry({ path: 'vendor/sub/a/../../root.txt', submoduleRoot: 'vendor/sub' })
      )
    ).toBeNull()
    expect(
      resolveSubmoduleDiscardTarget(
        entry({ path: 'vendor/sub/./a.txt', submoduleRoot: 'vendor/sub' })
      )
    ).toBeNull()
  })

  it('refuses a submodule path that is itself a traversal', () => {
    expect(
      resolveSubmoduleDiscardTarget(entry({ path: '../out/a.txt', submoduleRoot: '../out' }))
    ).toBeNull()
  })
})

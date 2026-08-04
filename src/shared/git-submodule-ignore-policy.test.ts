import { describe, expect, it } from 'vitest'
import {
  applySubmoduleIgnorePolicy,
  applySubmoduleIgnorePolicyToEntries,
  buildSubmoduleIgnorePolicy,
  isSubmoduleIgnorePolicyInert,
  type SubmoduleIgnorePolicy
} from './git-submodule-ignore-policy'

// Verbatim `git config --get-regexp` output shapes (captured from Git 2.50).
const GITMODULES_PLAIN = 'submodule.vendor/sub.path vendor/sub\n'
const GITMODULES_IGNORE_ALL =
  'submodule.vendor/sub.path vendor/sub\nsubmodule.vendor/sub.ignore all\n'

function gitlinkRow(
  overrides: Partial<{
    commitChanged: boolean
    trackedChanges: boolean
    untrackedChanges: boolean
  }> = {}
) {
  return {
    path: 'vendor/sub',
    status: 'modified',
    area: 'unstaged',
    submodule: {
      commitChanged: true,
      trackedChanges: false,
      untrackedChanges: false,
      ...overrides
    }
  }
}

describe('buildSubmoduleIgnorePolicy', () => {
  it('is inert when nothing is configured', () => {
    expect(isSubmoduleIgnorePolicyInert(buildSubmoduleIgnorePolicy('', ''))).toBe(true)
    expect(isSubmoduleIgnorePolicyInert(buildSubmoduleIgnorePolicy(GITMODULES_PLAIN, ''))).toBe(
      true
    )
  })

  it('maps a checked-in .gitmodules ignore onto the submodule path', () => {
    const policy = buildSubmoduleIgnorePolicy(GITMODULES_IGNORE_ALL, '')

    expect(policy.byPath.get('vendor/sub')).toBe('all')
    expect(policy.fallback).toBe('none')
  })

  it('lets repo config beat .gitmodules, and diff.ignoreSubmodules act as the default', () => {
    const policy = buildSubmoduleIgnorePolicy(
      GITMODULES_IGNORE_ALL,
      'diff.ignoresubmodules dirty\nsubmodule.vendor/sub.ignore untracked\n'
    )

    expect(policy.byPath.get('vendor/sub')).toBe('untracked')
    expect(policy.fallback).toBe('dirty')
  })

  it('keeps a subsection name that contains dots and slashes intact', () => {
    // Why: the key is cut at the LAST dot — `submodule.a.b/c.ignore` is one name.
    const policy = buildSubmoduleIgnorePolicy(
      'submodule.a.b/c.path deps/a.b/c\nsubmodule.a.b/c.ignore dirty\n',
      ''
    )

    expect(policy.byPath.get('deps/a.b/c')).toBe('dirty')
  })

  it('ignores an unrecognised ignore value rather than guessing', () => {
    const policy = buildSubmoduleIgnorePolicy(
      'submodule.vendor/sub.path vendor/sub\nsubmodule.vendor/sub.ignore bogus\n',
      ''
    )

    expect(policy.byPath.has('vendor/sub')).toBe(false)
  })
})

describe('applySubmoduleIgnorePolicy', () => {
  const withMode = (mode: SubmoduleIgnorePolicy['fallback']): SubmoduleIgnorePolicy => ({
    byPath: new Map([['vendor/sub', mode]]),
    fallback: 'none'
  })

  it('passes non-gitlink rows through untouched', () => {
    const row = { path: 'rootfile.txt', status: 'modified', area: 'unstaged' }

    expect(applySubmoduleIgnorePolicy(row, withMode('all'))).toBe(row)
  })

  it('drops a commit-drift-only row under ignore = all', () => {
    // This is the reported symptom: `git checkout` moved the gitlink, nobody edited
    // anything, and the repo asked for the submodule to stay quiet.
    expect(applySubmoduleIgnorePolicy(gitlinkRow(), withMode('all'))).toBeNull()
  })

  it('keeps a commit-drift-only row under ignore = dirty, exactly as Git does', () => {
    expect(applySubmoduleIgnorePolicy(gitlinkRow(), withMode('dirty'))?.submodule).toEqual({
      commitChanged: true,
      trackedChanges: false,
      untrackedChanges: false
    })
  })

  it('DEVIATION: still reports tracked dirt under ignore = all', () => {
    // Why: hiding a user's uncommitted edits in an IDE risks losing them — that
    // invisibility is the regression --ignore-submodules=none was added to fix.
    const narrowed = applySubmoduleIgnorePolicy(
      gitlinkRow({ commitChanged: true, trackedChanges: true, untrackedChanges: true }),
      withMode('all')
    )

    expect(narrowed?.submodule).toEqual({
      commitChanged: false,
      trackedChanges: true,
      untrackedChanges: false
    })
  })

  it('drops untracked-only dirt under ignore = untracked but keeps the commit signal', () => {
    expect(
      applySubmoduleIgnorePolicy(
        gitlinkRow({ commitChanged: false, untrackedChanges: true }),
        withMode('untracked')
      )
    ).toBeNull()
    expect(
      applySubmoduleIgnorePolicy(
        gitlinkRow({ commitChanged: true, untrackedChanges: true }),
        withMode('untracked')
      )?.submodule
    ).toEqual({ commitChanged: true, trackedChanges: false, untrackedChanges: false })
  })

  it('falls back to diff.ignoreSubmodules for a submodule with no key of its own', () => {
    const policy: SubmoduleIgnorePolicy = { byPath: new Map(), fallback: 'all' }

    expect(applySubmoduleIgnorePolicy(gitlinkRow(), policy)).toBeNull()
  })
})

describe('applySubmoduleIgnorePolicy over a STAGED gitlink row', () => {
  // `submodule.<name>.ignore` / `diff.ignoreSubmodules` govern worktree-vs-index
  // only, so Git reports every staged gitlink regardless. Measured on Git 2.50
  // with `ignore = all` delivered through .gitmodules, .git/config and the global
  // diff.ignoreSubmodules: `A  vendor/sub`, `R  vendor/sub -> …` and
  // `M  vendor/sub` all survive.
  const allMode: SubmoduleIgnorePolicy = {
    byPath: new Map([['vendor/sub', 'all']]),
    fallback: 'none'
  }
  const CLEAR = { commitChanged: false, trackedChanges: false, untrackedChanges: false }

  for (const status of ['added', 'renamed', 'copied', 'modified'] as const) {
    it(`keeps a staged ${status} gitlink untouched even under ignore = all`, () => {
      const row = { path: 'vendor/sub', status, area: 'staged', submodule: CLEAR }

      expect(applySubmoduleIgnorePolicy(row, allMode)).toBe(row)
    })
  }

  it('keeps a staged pointer bump, which Git reports under every ignore setting', () => {
    // `git add <submodule>` after advancing it emits `1 M. S...`; the parser's
    // S...-with-M special case makes commitChanged true. Dropping it hid a staged
    // change from the panel that was about to commit it.
    const stagedBump = {
      path: 'vendor/sub',
      status: 'modified',
      area: 'staged',
      submodule: { commitChanged: true, trackedChanges: false, untrackedChanges: false }
    }

    expect(applySubmoduleIgnorePolicy(stagedBump, allMode)).toBe(stagedBump)
  })

  it('still narrows the unstaged drift for the same submodule', () => {
    // The contrast: worktree-vs-index IS what the setting governs, and hiding this
    // row is the whole point of honouring it.
    expect(
      applySubmoduleIgnorePolicy(
        {
          path: 'vendor/sub',
          status: 'modified',
          area: 'unstaged',
          submodule: { commitChanged: true, trackedChanges: false, untrackedChanges: false }
        },
        allMode
      )
    ).toBeNull()
  })
})

describe('applySubmoduleIgnorePolicy over an UNSTAGED gitlink entry change', () => {
  // Git emits `S...` — every inner flag clear — for these, because the sub-state
  // describes what is going on INSIDE the submodule while the row is about the
  // gitlink entry itself. Verified against Git 2.50:
  //   `rm -rf vendor/sub`  -> `1 .D S... … vendor/sub`, and ` D vendor/sub`
  //                            survives a checked-in `ignore = dirty`/`untracked`
  //                            and disappears only under `ignore = all`.
  const CLEAR_SUB_STATE = {
    commitChanged: false,
    trackedChanges: false,
    untrackedChanges: false
  }
  const withMode = (mode: SubmoduleIgnorePolicy['fallback']): SubmoduleIgnorePolicy => ({
    byPath: new Map([['vendor/sub', mode]]),
    fallback: 'none'
  })
  const deletedRow = {
    path: 'vendor/sub',
    status: 'deleted',
    area: 'unstaged',
    submodule: CLEAR_SUB_STATE
  }

  for (const mode of ['untracked', 'dirty'] as const) {
    it(`keeps a deleted gitlink under ignore = ${mode}, exactly as Git does`, () => {
      expect(applySubmoduleIgnorePolicy(deletedRow, withMode(mode))).toBe(deletedRow)
    })
  }

  it('drops a deleted gitlink under ignore = all, exactly as Git does', () => {
    expect(applySubmoduleIgnorePolicy(deletedRow, withMode('all'))).toBeNull()
  })

  it('still drops a modified gitlink with no inner signal left', () => {
    // The contrast that makes the status check meaningful: a `modified` gitlink is
    // only ever about the submodule's inner state, so an emptied one has nothing
    // left to show.
    expect(
      applySubmoduleIgnorePolicy(
        { path: 'vendor/sub', status: 'modified', area: 'unstaged', submodule: CLEAR_SUB_STATE },
        withMode('dirty')
      )
    ).toBeNull()
  })

  it('narrows untracked dirt on a deleted gitlink without dropping the row', () => {
    const deletedAndDirty = {
      ...deletedRow,
      submodule: { commitChanged: false, trackedChanges: false, untrackedChanges: true }
    }

    expect(applySubmoduleIgnorePolicy(deletedAndDirty, withMode('untracked'))).toEqual({
      ...deletedAndDirty,
      submodule: CLEAR_SUB_STATE
    })
  })
})

describe('applySubmoduleIgnorePolicyToEntries', () => {
  it('returns the same rows when the policy is inert', () => {
    const entries = [gitlinkRow(), { path: 'rootfile.txt', status: 'modified', area: 'unstaged' }]

    expect(
      applySubmoduleIgnorePolicyToEntries(entries, buildSubmoduleIgnorePolicy('', ''))
    ).toEqual(entries)
  })

  it('drops only the fully-ignored gitlink and leaves ordinary rows in place', () => {
    const entries = [{ path: 'rootfile.txt', status: 'modified', area: 'unstaged' }, gitlinkRow()]
    const policy = buildSubmoduleIgnorePolicy(GITMODULES_IGNORE_ALL, '')

    expect(applySubmoduleIgnorePolicyToEntries(entries, policy)).toEqual([entries[0]])
  })
})

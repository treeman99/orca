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

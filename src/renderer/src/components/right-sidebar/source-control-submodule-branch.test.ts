import { describe, expect, it } from 'vitest'
import {
  getSubmoduleBranchLabel,
  toShortSubmoduleBranchName
} from './source-control-submodule-branch'
import type { SubmoduleStatusState } from './source-control/listing/submodule-expansion'

function loaded(extra: Partial<Extract<SubmoduleStatusState, { status: 'loaded' }>> = {}) {
  return { status: 'loaded', entries: [], ...extra } as SubmoduleStatusState
}

describe('toShortSubmoduleBranchName', () => {
  it('strips the refs/heads prefix and passes short names through', () => {
    expect(toShortSubmoduleBranchName('refs/heads/other-branch')).toBe('other-branch')
    expect(toShortSubmoduleBranchName('other-branch')).toBe('other-branch')
  })

  it('treats blank and missing values as no branch', () => {
    expect(toShortSubmoduleBranchName(undefined)).toBeNull()
    expect(toShortSubmoduleBranchName('   ')).toBeNull()
    expect(toShortSubmoduleBranchName('refs/heads/')).toBeNull()
  })
})

describe('getSubmoduleBranchLabel', () => {
  it('flags a submodule sitting on a different branch than the root', () => {
    // Why: this is the reported configuration — root on main, submodule on its own branch.
    expect(getSubmoduleBranchLabel(loaded({ branch: 'refs/heads/other-branch' }), 'main')).toEqual({
      name: 'other-branch',
      detached: false,
      differsFromParent: true
    })
  })

  it('does not flag a submodule that tracks the same branch as the root', () => {
    expect(getSubmoduleBranchLabel(loaded({ branch: 'refs/heads/main' }), 'main')).toEqual({
      name: 'main',
      detached: false,
      differsFromParent: false
    })
  })

  it('falls back to the abbreviated head for a detached submodule', () => {
    // Why: `git submodule update` leaves a detached HEAD, so branch is absent.
    expect(
      getSubmoduleBranchLabel(loaded({ head: '031c1df1f5107f0c449f65f563df0ee61d6769f1' }), 'main')
    ).toEqual({ name: '031c1df', detached: true, differsFromParent: true })
  })

  it('renders nothing until the inner status has loaded', () => {
    // Why: the branch comes from that same response — no extra git call is made for it.
    expect(getSubmoduleBranchLabel(undefined, 'main')).toBeNull()
    expect(getSubmoduleBranchLabel({ status: 'loading' }, 'main')).toBeNull()
    expect(getSubmoduleBranchLabel({ status: 'error', error: 'boom' }, 'main')).toBeNull()
  })

  it('renders nothing when the response carried neither branch nor head', () => {
    expect(getSubmoduleBranchLabel(loaded(), 'main')).toBeNull()
  })

  it('treats a submodule branch as differing when the root branch is unknown', () => {
    expect(getSubmoduleBranchLabel(loaded({ branch: 'refs/heads/other' }), '')).toEqual({
      name: 'other',
      detached: false,
      differsFromParent: true
    })
  })
})

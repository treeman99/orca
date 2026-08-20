import { describe, expect, it } from 'vitest'
import { isUnbornHeadGitError } from './git-unborn-head-error'

describe('isUnbornHeadGitError', () => {
  it('matches the stderr git writes for restore --staged before the first commit', () => {
    expect(isUnbornHeadGitError({ stderr: 'fatal: could not resolve HEAD\n' })).toBe(true)
  })

  it('matches an unresolvable HEAD reported through message or stdout', () => {
    expect(isUnbornHeadGitError(new Error("fatal: ambiguous argument 'HEAD'"))).toBe(true)
    expect(isUnbornHeadGitError({ stdout: "Failed to resolve 'HEAD' as a valid ref" })).toBe(true)
  })

  // Why it must stay narrow: a broad match would swallow real failures into a `git reset`.
  it('does not match unrelated git failures', () => {
    expect(isUnbornHeadGitError({ stderr: 'error: pathspec did not match any file' })).toBe(false)
    expect(isUnbornHeadGitError(new Error('index.lock exists'))).toBe(false)
    expect(isUnbornHeadGitError(undefined)).toBe(false)
  })
})

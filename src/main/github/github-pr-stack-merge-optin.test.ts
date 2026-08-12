// GitHub's `pulls/{n}/merge-async` merges the addressed PR *and every PR below it*. mergePR takes
// one PR number, so promoting a stacked PR onto that endpoint is a write the caller did not ask
// for unless it says it showed the user the scope. These are negative tests on purpose: they pin
// "mergeGitHubPRStack is never reached without the opt-in", so an upstream sync that restores the
// silent promotion turns this file red instead of shipping quietly.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as GhUtilsModule from './gh-utils'
import type * as GitHubPRStackAsyncMergeModule from './github-pr-stack-async-merge'

const { ghExecFileAsyncMock, mergeGitHubPRStackMock } = vi.hoisted(() => ({
  ghExecFileAsyncMock: vi.fn(),
  mergeGitHubPRStackMock: vi.fn()
}))

vi.mock('./gh-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof GhUtilsModule>()
  return {
    ...actual,
    ghExecFileAsync: ghExecFileAsyncMock,
    acquire: vi.fn(async () => {}),
    release: vi.fn()
  }
})

// Mock the module that owns the endpoint, not the barrel that re-exports it: a refactor which
// imports mergeGitHubPRStack straight from here would slip past a barrel-level mock and leave
// this suite green while the silent promotion is back.
vi.mock('./github-pr-stack-async-merge', async (importOriginal) => {
  const actual = await importOriginal<typeof GitHubPRStackAsyncMergeModule>()
  return { ...actual, mergeGitHubPRStack: mergeGitHubPRStackMock }
})

// Why: translateMain returns its fallback uninterpolated until i18n init resolves, which never
// happens in a unit test. Substitute here so the assertions read the message a user would see.
vi.mock('../i18n/main-i18n', () => ({
  translateMain: (_key: string, fallback: string, options?: Record<string, unknown>) =>
    Object.entries(options ?? {}).reduce(
      (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
      fallback
    )
}))

import { mergePR } from './client'

const PR_REPO = { owner: 'stablyai', repo: 'orca', host: 'github.com' }

function stackedPullRequestResponse(): { stdout: string } {
  return {
    stdout: JSON.stringify({
      number: 202,
      title: 'Stack API',
      state: 'open',
      head: { ref: 'stack/api', sha: 'api-sha' },
      base: { ref: 'stack/models', sha: 'models-sha' },
      stack: { number: 51, position: 2, size: 2, base: { ref: 'main', sha: 'main-sha' } }
    })
  }
}

function legacyMergeCalls(): unknown[][] {
  return ghExecFileAsyncMock.mock.calls.filter(
    ([args]) => Array.isArray(args) && args[0] === 'pr' && args[1] === 'merge'
  )
}

// The transport-level invariant, independent of which module owns the call today.
function asyncMergeEndpointCalls(): unknown[][] {
  return ghExecFileAsyncMock.mock.calls.filter(
    ([args]) =>
      Array.isArray(args) && args.some((arg) => String(arg).includes('/pulls/202/merge-async'))
  )
}

describe('GitHub PR stack merge opt-in', () => {
  beforeEach(() => {
    ghExecFileAsyncMock.mockReset()
    mergeGitHubPRStackMock.mockReset()
    mergeGitHubPRStackMock.mockImplementation(() => {
      throw new Error('stack merge was promoted without the caller opting in')
    })
  })

  it('refuses a stacked PR when the caller did not confirm the stack scope', async () => {
    ghExecFileAsyncMock.mockResolvedValueOnce(stackedPullRequestResponse())

    const result = await mergePR('/repo-root', 202, 'squash', undefined, PR_REPO)

    expect(result.ok).toBe(false)
    expect(mergeGitHubPRStackMock).not.toHaveBeenCalled()
    expect(asyncMergeEndpointCalls()).toHaveLength(0)
  })

  it('refuses just the same when the caller opts out explicitly', async () => {
    ghExecFileAsyncMock.mockResolvedValueOnce(stackedPullRequestResponse())

    const result = await mergePR(
      '/repo-root',
      202,
      'squash',
      undefined,
      PR_REPO,
      {},
      'single-pr-only'
    )

    expect(result.ok).toBe(false)
    expect(mergeGitHubPRStackMock).not.toHaveBeenCalled()
  })

  it('names the PR, the write it would make, and where to do it with the scope visible', async () => {
    ghExecFileAsyncMock.mockResolvedValueOnce(stackedPullRequestResponse())

    const result = await mergePR('/repo-root', 202, 'squash', undefined, PR_REPO)

    expect(result).toEqual({ ok: false, error: expect.stringContaining('#202') })
    const error = result.ok ? '' : result.error
    expect(error).toContain('2 pull requests')
    expect(error).toContain('review sidebar')
  })

  it('does not quietly downgrade to a single-PR merge instead', async () => {
    // A silent single-PR fallback would hide the divergence: the caller asked for a merge and got
    // a different one than GitHub would have performed. Refusing is the point.
    ghExecFileAsyncMock.mockResolvedValueOnce(stackedPullRequestResponse())

    await mergePR('/repo-root', 202, 'squash', undefined, PR_REPO)

    expect(legacyMergeCalls()).toHaveLength(0)
  })

  it('promotes to the stack merge once the caller confirms the scope', async () => {
    ghExecFileAsyncMock.mockResolvedValueOnce(stackedPullRequestResponse()).mockResolvedValueOnce({
      stdout: JSON.stringify({ data: { repository: { mergeQueue: null } } })
    })
    mergeGitHubPRStackMock.mockResolvedValue({ ok: true })

    const result = await mergePR(
      '/repo-root',
      202,
      'squash',
      undefined,
      PR_REPO,
      {},
      'confirmed-stack-scope'
    )

    expect(result).toEqual({ ok: true })
    expect(mergeGitHubPRStackMock).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 202, method: 'squash', mergeAction: 'direct_merge' })
    )
  })

  it('leaves unstacked PRs on the ordinary merge path with no opt-in at all', async () => {
    ghExecFileAsyncMock
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          number: 7,
          state: 'open',
          head: { ref: 'feature/api', sha: 'api-sha' },
          base: { ref: 'main', sha: 'main-sha' },
          stack: null
        })
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          number: 7,
          title: 'PR',
          state: 'OPEN',
          url: 'https://github.com/stablyai/orca/pull/7',
          statusCheckRollup: [],
          updatedAt: '2026-04-01T00:00:00Z',
          isDraft: false,
          mergeable: 'MERGEABLE',
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'CLEAN',
          autoMergeRequest: null,
          baseRefName: 'main',
          baseRefOid: 'base-oid',
          headRefOid: 'head-oid'
        })
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ data: { repository: { mergeQueue: null } } })
      })
      .mockResolvedValueOnce({ stdout: '' })

    const result = await mergePR('/repo-root', 7, 'squash', undefined, PR_REPO)

    expect(result).toEqual({ ok: true })
    expect(mergeGitHubPRStackMock).not.toHaveBeenCalled()
    expect(legacyMergeCalls()).toHaveLength(1)
  })
})

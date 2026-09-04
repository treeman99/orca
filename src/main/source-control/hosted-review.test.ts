import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getHostedReviewForBranch } from './hosted-review'
import { __resetHostedReviewBranchCacheForTests } from './hosted-review-branch-cache'

const {
  getProjectSlugMock,
  getMergeRequestForBranchMock,
  getRepoSlugMock,
  getPRForBranchOutcomeMock,
  getBitbucketRepoSlugMock,
  getBitbucketPullRequestForBranchMock,
  getAzureDevOpsRepoSlugMock,
  getAzureDevOpsPullRequestForBranchMock,
  getGiteaRepoSlugMock,
  getGiteaPullRequestForBranchMock
} = vi.hoisted(() => ({
  getProjectSlugMock: vi.fn(),
  getMergeRequestForBranchMock: vi.fn(),
  getRepoSlugMock: vi.fn(),
  getPRForBranchOutcomeMock: vi.fn(),
  getBitbucketRepoSlugMock: vi.fn(),
  getBitbucketPullRequestForBranchMock: vi.fn(),
  getAzureDevOpsRepoSlugMock: vi.fn(),
  getAzureDevOpsPullRequestForBranchMock: vi.fn(),
  getGiteaRepoSlugMock: vi.fn(),
  getGiteaPullRequestForBranchMock: vi.fn()
}))

vi.mock('../gitlab/client', () => ({
  getProjectSlug: getProjectSlugMock,
  getMergeRequestForBranch: getMergeRequestForBranchMock,
  // Why: forge-provider resolves branch reviews via the OrThrow variant so
  // lookup failures surface as unavailable instead of "no PR found".
  getMergeRequestForBranchOrThrow: getMergeRequestForBranchMock,
  getMergeRequest: vi.fn()
}))

vi.mock('../github/client', () => ({
  getRepoSlug: getRepoSlugMock,
  getPRForBranchOutcome: getPRForBranchOutcomeMock,
  getGitHubPRLookupRateLimitBlock: vi.fn(async () => null),
  createGitHubPullRequest: vi.fn()
}))

vi.mock('../bitbucket/client', () => ({
  getBitbucketRepoSlug: getBitbucketRepoSlugMock,
  getBitbucketPullRequestForBranch: getBitbucketPullRequestForBranchMock,
  // Why: forge-provider resolves branch reviews via the OrThrow variant so
  // lookup failures surface as unavailable instead of "no PR found".
  getBitbucketPullRequestForBranchOrThrow: getBitbucketPullRequestForBranchMock,
  getBitbucketPullRequest: vi.fn()
}))

vi.mock('../azure-devops/client', () => ({
  getAzureDevOpsRepoSlug: getAzureDevOpsRepoSlugMock,
  getAzureDevOpsPullRequestForBranch: getAzureDevOpsPullRequestForBranchMock,
  // Why: forge-provider resolves branch reviews via the OrThrow variant so
  // lookup failures surface as unavailable instead of "no PR found".
  getAzureDevOpsPullRequestForBranchOrThrow: getAzureDevOpsPullRequestForBranchMock,
  getAzureDevOpsPullRequest: vi.fn()
}))

vi.mock('../gitea/client', () => ({
  getGiteaRepoSlug: getGiteaRepoSlugMock,
  getGiteaPullRequestForBranch: getGiteaPullRequestForBranchMock,
  // Why: forge-provider resolves branch reviews via the OrThrow variant so
  // lookup failures surface as unavailable instead of "no PR found".
  getGiteaPullRequestForBranchOrThrow: getGiteaPullRequestForBranchMock,
  getGiteaPullRequest: vi.fn()
}))

describe('getHostedReviewForBranch', () => {
  beforeEach(() => {
    getProjectSlugMock.mockReset()
    getMergeRequestForBranchMock.mockReset()
    getRepoSlugMock.mockReset()
    getPRForBranchOutcomeMock.mockReset()
    getBitbucketRepoSlugMock.mockReset()
    getBitbucketPullRequestForBranchMock.mockReset()
    getAzureDevOpsRepoSlugMock.mockReset()
    getAzureDevOpsPullRequestForBranchMock.mockReset()
    getGiteaRepoSlugMock.mockReset()
    getGiteaPullRequestForBranchMock.mockReset()
    // The branch cache is process-wide, so one test's answer would otherwise
    // satisfy the next one's lookup.
    __resetHostedReviewBranchCacheForTests()
  })

  it('maps GitLab merge requests into the hosted review surface', async () => {
    getProjectSlugMock.mockResolvedValue({ host: 'gitlab.com', path: 'g/p' })
    getMergeRequestForBranchMock.mockResolvedValue({
      number: 7,
      title: 'GitLab branch',
      state: 'opened',
      url: 'https://gitlab.com/g/p/-/merge_requests/7',
      pipelineStatus: 'success',
      updatedAt: '2026-05-10T00:00:00.000Z',
      mergeable: 'MERGEABLE'
    })

    await expect(
      getHostedReviewForBranch({
        repoPath: '/repo',
        executionHostId: 'ssh:ssh-1',
        branch: 'refs/heads/feature'
      })
    ).resolves.toEqual({
      provider: 'gitlab',
      number: 7,
      title: 'GitLab branch',
      state: 'open',
      url: 'https://gitlab.com/g/p/-/merge_requests/7',
      status: 'success',
      updatedAt: '2026-05-10T00:00:00.000Z',
      mergeable: 'MERGEABLE'
    })
    expect(getProjectSlugMock).toHaveBeenCalledWith('/repo', 'ssh-1')
    expect(getMergeRequestForBranchMock).toHaveBeenCalledWith('/repo', 'feature', null, 'ssh-1')
    expect(getPRForBranchOutcomeMock).not.toHaveBeenCalled()
  })

  it('falls through to GitHub when origin is not GitLab', async () => {
    getProjectSlugMock.mockResolvedValue(null)
    getRepoSlugMock.mockResolvedValue({ owner: 'o', repo: 'r' })
    getPRForBranchOutcomeMock.mockResolvedValue({
      kind: 'found',
      fetchedAt: 1,
      pr: {
        number: 3,
        title: 'GitHub branch',
        state: 'open',
        url: 'https://github.com/o/r/pull/3',
        checksStatus: 'pending',
        updatedAt: '2026-05-10T00:00:00.000Z',
        mergeable: 'UNKNOWN'
      }
    })

    await expect(
      getHostedReviewForBranch({
        executionHostId: 'local',
        repoPath: '/repo',
        branch: 'feature',
        linkedGitHubPR: 3
      })
    ).resolves.toMatchObject({
      provider: 'github',
      number: 3,
      status: 'pending'
    })
    expect(getPRForBranchOutcomeMock).toHaveBeenCalledWith('/repo', 'feature', 3, null, null, {
      currentHeadOid: null
    })
  })

  it('routes local WSL project branch lookup through provider detection and the selected provider', async () => {
    getProjectSlugMock.mockResolvedValue({ host: 'gitlab.com', path: 'team/orca' })
    getMergeRequestForBranchMock.mockResolvedValue({
      number: 22,
      title: 'GitLab WSL branch',
      state: 'open',
      url: 'https://gitlab.com/team/orca/-/merge_requests/22',
      pipelineStatus: 'pending',
      updatedAt: '2026-06-16T00:00:00.000Z',
      mergeable: 'UNKNOWN'
    })

    await expect(
      getHostedReviewForBranch({
        executionHostId: 'local',
        repoPath: '/repo',
        branch: 'feature/wsl',
        localGitExecOptions: { wslDistro: 'Ubuntu' }
      })
    ).resolves.toMatchObject({
      provider: 'gitlab',
      number: 22,
      status: 'pending'
    })

    // Why: the WSL exec options must reach both provider detection and the
    // selected provider's lookup, not just the first call.
    const executionOptions = { localGitExecOptions: { wslDistro: 'Ubuntu' } }
    expect(getProjectSlugMock).toHaveBeenCalledWith('/repo', null, executionOptions)
    expect(getMergeRequestForBranchMock).toHaveBeenCalledWith(
      '/repo',
      'feature/wsl',
      null,
      null,
      executionOptions
    )
  })

  it('uses fallback GitHub PR when branch is empty', async () => {
    getProjectSlugMock.mockResolvedValue(null)
    getRepoSlugMock.mockResolvedValue({ owner: 'o', repo: 'r' })
    getPRForBranchOutcomeMock.mockResolvedValue({
      kind: 'found',
      fetchedAt: 1,
      pr: {
        number: 42,
        title: 'Detached GitHub branch',
        state: 'open',
        url: 'https://github.com/o/r/pull/42',
        checksStatus: 'success',
        updatedAt: '2026-05-10T00:00:00.000Z',
        mergeable: 'MERGEABLE'
      }
    })

    await expect(
      getHostedReviewForBranch({
        executionHostId: 'local',
        repoPath: '/repo',
        branch: '',
        fallbackGitHubPR: 42
      })
    ).resolves.toMatchObject({
      provider: 'github',
      number: 42,
      status: 'success'
    })
    expect(getPRForBranchOutcomeMock).toHaveBeenCalledWith('/repo', '', null, null, 42, {
      acceptMergedFallbackPR: true,
      currentHeadOid: null
    })
  })
})

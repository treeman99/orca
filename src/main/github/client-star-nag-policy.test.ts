// Fork-owned: proves disableStarNag stops the gh spawn itself, not just the UI that
// prompts for it. Kept out of upstream's client-starred.test.ts so an upstream split
// of that file cannot carry the gate away with it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as GithubApiRepositoryModule from './github-api-repository'
import type * as GitHubEnterpriseRepositoryModule from './github-enterprise-repository'

const { clientMocks, moduleMocks, getEnterprisePolicyMock } = await vi.hoisted(async () => {
  const moduleMocks = await import('./client-test-mocks')
  return {
    clientMocks: moduleMocks.createGitHubClientMocks(),
    moduleMocks,
    getEnterprisePolicyMock: vi.fn()
  }
})

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))
vi.mock('./gh-utils', () => moduleMocks.ghUtilsModuleMock(clientMocks))
vi.mock('../git/runner', () => moduleMocks.gitRunnerModuleMock(clientMocks))
vi.mock('../providers/ssh-git-dispatch', () => moduleMocks.sshGitDispatchModuleMock(clientMocks))
vi.mock('./local-git-config-signature', () =>
  moduleMocks.localGitConfigSignatureModuleMock(clientMocks)
)
vi.mock('./github-enterprise-repository', async (importOriginal) =>
  moduleMocks.githubEnterpriseRepositoryModuleMock(
    await importOriginal<typeof GitHubEnterpriseRepositoryModule>()
  )
)
vi.mock('./rate-limit', () => moduleMocks.rateLimitModuleMock(clientMocks))
vi.mock('./github-api-repository', async (importOriginal) =>
  moduleMocks.githubApiRepositoryModuleMock(
    clientMocks,
    await importOriginal<typeof GithubApiRepositoryModule>()
  )
)

import { __resetOrcaStarCheckForTests, checkOrcaStarred, starOrca } from './client'
import { resetOriginRepositoryCache } from './client-test-harness'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const { ghExecFileAsyncMock, acquireMock, releaseMock } = clientMocks

beforeEach(() => {
  resetOriginRepositoryCache()
  // Upstream coalesces concurrent checks into one in-flight promise; a leftover would let
  // the next case inherit this one's answer and hide a gate that stopped firing.
  __resetOrcaStarCheckForTests()
  ghExecFileAsyncMock.mockReset()
  acquireMock.mockReset()
  releaseMock.mockReset()
  acquireMock.mockResolvedValue(undefined)
  getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
})

describe('checkOrcaStarred under enterprise policy', () => {
  it('never spawns gh when the policy disables the star nag', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    // "Already starred" is what makes every caller drop the prompt silently.
    await expect(checkOrcaStarred()).resolves.toBe(true)

    expect(ghExecFileAsyncMock).not.toHaveBeenCalled()
    expect(acquireMock).not.toHaveBeenCalled()
  })

  it('still spawns gh when only unrelated policy switches are on', async () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeLockdownPolicy({ lockdown: false, disableStarNag: false })
    )
    ghExecFileAsyncMock.mockResolvedValueOnce({ stdout: 'HTTP/2.0 204 No Content\r\n', stderr: '' })

    await expect(checkOrcaStarred()).resolves.toBe(true)

    expect(ghExecFileAsyncMock).toHaveBeenCalledTimes(1)
  })
})

describe('starOrca under enterprise policy', () => {
  it('stars the repo through gh when no policy blocks it', async () => {
    ghExecFileAsyncMock.mockResolvedValueOnce({ stdout: '', stderr: '' })

    await expect(starOrca()).resolves.toBe(true)

    expect(ghExecFileAsyncMock).toHaveBeenCalledWith(
      ['api', '-X', 'PUT', 'user/starred/stablyai/orca'],
      { encoding: 'utf-8', timeout: 15_000 }
    )
  })

  it('never spawns gh when the policy disables the star nag', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    await expect(starOrca()).resolves.toBe(false)

    expect(ghExecFileAsyncMock).not.toHaveBeenCalled()
    expect(acquireMock).not.toHaveBeenCalled()
  })
})

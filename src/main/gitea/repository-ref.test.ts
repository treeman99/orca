import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { gitExecFileAsyncMock, sshExecMock, getEnterprisePolicyMock } = vi.hoisted(() => ({
  gitExecFileAsyncMock: vi.fn(),
  sshExecMock: vi.fn(),
  getEnterprisePolicyMock: vi.fn()
}))

vi.mock('../git/runner', () => ({
  gitExecFileAsync: gitExecFileAsyncMock
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))

import { makeEnterprisePolicy } from '../../shared/enterprise-policy-fixture'

import {
  _getGiteaRepoRefCacheSize,
  _resetGiteaRepoRefCache,
  getGiteaRepoRef,
  getGiteaRepoRefForRemote,
  parseGiteaRepoRef
} from './repository-ref'
import { registerSshGitProvider, unregisterSshGitProvider } from '../providers/ssh-git-dispatch'
import { REMOTE_URL_PROBE_TIMEOUT_MS } from '../git/remote-url-probe'

describe('Gitea repository ref parsing', () => {
  beforeEach(() => {
    gitExecFileAsyncMock.mockReset()
    sshExecMock.mockReset()
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
    unregisterSshGitProvider('conn-1')
    _resetGiteaRepoRefCache()
  })

  afterEach(() => {
    unregisterSshGitProvider('conn-1')
  })

  it('parses HTTPS remotes and derives the API base URL', () => {
    expect(parseGiteaRepoRef('https://git.example.com/team/project.git')).toEqual({
      host: 'git.example.com',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://git.example.com/api/v1',
      webBaseUrl: 'https://git.example.com'
    })
  })

  it('strips trailing slashes after .git suffixes', () => {
    expect(parseGiteaRepoRef('https://git.example.com/team/project.git/')).toEqual({
      host: 'git.example.com',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://git.example.com/api/v1',
      webBaseUrl: 'https://git.example.com'
    })
    expect(parseGiteaRepoRef('git@gitea.example.test:team/project.git/')).toMatchObject({
      host: 'gitea.example.test',
      owner: 'team',
      repo: 'project'
    })
  })

  it('preserves an HTTP subpath when deriving the API base URL', () => {
    expect(parseGiteaRepoRef('https://git.example.com/code/team/project.git')).toEqual({
      host: 'git.example.com',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://git.example.com/code/api/v1',
      webBaseUrl: 'https://git.example.com/code'
    })
  })

  it('parses scp-like SSH remotes with an HTTPS web/API base', () => {
    expect(parseGiteaRepoRef('git@gitea.example.test:team/project.git')).toEqual({
      host: 'gitea.example.test',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://gitea.example.test/api/v1',
      webBaseUrl: 'https://gitea.example.test'
    })
  })

  it('preserves a scp-like SSH subpath when deriving the API base URL', () => {
    expect(parseGiteaRepoRef('git@gitea.example.test:code/team/project.git')).toEqual({
      host: 'gitea.example.test',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://gitea.example.test/code/api/v1',
      webBaseUrl: 'https://gitea.example.test/code'
    })
  })

  it('parses ssh:// remotes without carrying the SSH port into web/API URLs', () => {
    expect(parseGiteaRepoRef('ssh://git@gitea.example.test:2222/team/project.git')).toEqual({
      host: 'gitea.example.test',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://gitea.example.test/api/v1',
      webBaseUrl: 'https://gitea.example.test'
    })
  })

  it('does not claim public hosts handled by more specific providers', () => {
    expect(parseGiteaRepoRef('git@github.com:team/project.git')).toBeNull()
    expect(parseGiteaRepoRef('https://gitlab.com/team/project.git')).toBeNull()
    expect(parseGiteaRepoRef('https://bitbucket.org/team/project.git')).toBeNull()
    expect(parseGiteaRepoRef('https://dev.azure.com/team/project/_git/repo')).toBeNull()
    expect(parseGiteaRepoRef('https://team.visualstudio.com/project/_git/repo')).toBeNull()
  })

  it('reads and caches the origin remote', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({
      stdout: 'https://git.example.com/team/project.git\n',
      stderr: ''
    })

    await expect(getGiteaRepoRef('/repo')).resolves.toMatchObject({
      host: 'git.example.com',
      owner: 'team',
      repo: 'project'
    })
    await expect(getGiteaRepoRef('/repo')).resolves.toMatchObject({
      host: 'git.example.com',
      owner: 'team',
      repo: 'project'
    })
    expect(gitExecFileAsyncMock).toHaveBeenCalledTimes(1)
    expect(gitExecFileAsyncMock).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], {
      cwd: '/repo',
      timeout: REMOTE_URL_PROBE_TIMEOUT_MS
    })
  })

  it('keeps local host and local WSL repository-ref cache entries separate', async () => {
    gitExecFileAsyncMock
      .mockResolvedValueOnce({
        stdout: 'https://git.example.com/host/project.git\n',
        stderr: ''
      })
      .mockResolvedValueOnce({
        stdout: 'https://git.example.com/wsl/project.git\n',
        stderr: ''
      })

    await expect(getGiteaRepoRef('/repo')).resolves.toMatchObject({
      owner: 'host',
      repo: 'project'
    })
    await expect(getGiteaRepoRef('/repo', null, { wslDistro: 'Ubuntu' })).resolves.toMatchObject({
      owner: 'wsl',
      repo: 'project'
    })
    await expect(getGiteaRepoRef('/repo', null, { wslDistro: 'Ubuntu' })).resolves.toMatchObject({
      owner: 'wsl',
      repo: 'project'
    })

    expect(gitExecFileAsyncMock).toHaveBeenCalledTimes(2)
    expect(gitExecFileAsyncMock).toHaveBeenNthCalledWith(1, ['remote', 'get-url', 'origin'], {
      cwd: '/repo',
      timeout: REMOTE_URL_PROBE_TIMEOUT_MS
    })
    expect(gitExecFileAsyncMock).toHaveBeenNthCalledWith(2, ['remote', 'get-url', 'origin'], {
      cwd: '/repo',
      wslDistro: 'Ubuntu',
      timeout: REMOTE_URL_PROBE_TIMEOUT_MS
    })
  })

  it('bounds cached repository refs for distinct repo paths', async () => {
    gitExecFileAsyncMock.mockResolvedValue({
      stdout: 'https://git.example.com/team/project.git\n',
      stderr: ''
    })

    for (let i = 0; i < 513; i += 1) {
      await getGiteaRepoRef(`/repo-${i}`)
    }

    expect(_getGiteaRepoRefCacheSize()).toBe(512)
  })

  it('resolves repository refs through the SSH git provider for connected repos', async () => {
    sshExecMock.mockResolvedValueOnce({
      stdout: 'git@gitea.example.test:remote/project.git\n',
      stderr: ''
    })
    registerSshGitProvider('conn-1', { exec: sshExecMock } as never)

    await expect(getGiteaRepoRefForRemote('/repo', 'origin', 'conn-1')).resolves.toMatchObject({
      host: 'gitea.example.test',
      owner: 'remote',
      repo: 'project'
    })

    expect(sshExecMock).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], '/repo', {
      signal: expect.any(AbortSignal)
    })
    expect(gitExecFileAsyncMock).not.toHaveBeenCalled()
  })

  it('does not cache transient SSH provider failures as unsupported repos', async () => {
    sshExecMock.mockRejectedValueOnce(new Error('connection closed')).mockResolvedValueOnce({
      stdout: 'git@gitea.example.test:remote/project.git\n',
      stderr: ''
    })
    registerSshGitProvider('conn-1', { exec: sshExecMock } as never)

    await expect(getGiteaRepoRefForRemote('/repo', 'origin', 'conn-1')).resolves.toBeNull()
    await expect(getGiteaRepoRefForRemote('/repo', 'origin', 'conn-1')).resolves.toMatchObject({
      host: 'gitea.example.test',
      owner: 'remote',
      repo: 'project'
    })

    expect(sshExecMock).toHaveBeenCalledTimes(2)
    expect(gitExecFileAsyncMock).not.toHaveBeenCalled()
  })
})

describe('enterprise GitHub host is never claimed as Gitea', () => {
  const GHES_HOST = 'github.samsungds.net'

  beforeEach(() => {
    gitExecFileAsyncMock.mockReset()
    getEnterprisePolicyMock.mockReturnValue(
      makeEnterprisePolicy({ githubEnterpriseHost: GHES_HOST })
    )
    _resetGiteaRepoRefCache()
  })

  it('rejects an HTTPS remote on the configured enterprise host', () => {
    expect(parseGiteaRepoRef(`https://${GHES_HOST}/org/repo.git`)).toBeNull()
  })

  it('rejects an scp-style remote on the configured enterprise host', () => {
    expect(parseGiteaRepoRef(`git@${GHES_HOST}:org/repo.git`)).toBeNull()
  })

  it('rejects the enterprise host regardless of remote-URL casing', () => {
    // The resolver lowercases the policy host, so the consumer must lowercase too.
    expect(parseGiteaRepoRef('git@GitHub.SamsungDS.net:org/repo.git')).toBeNull()
    expect(parseGiteaRepoRef('https://GitHub.SAMSUNGDS.net/org/repo.git')).toBeNull()
    expect(parseGiteaRepoRef(`ssh://git@GitHub.SamsungDS.NET:2222/org/repo.git`)).toBeNull()
  })

  // Why: a corporate checkout can carry any of these remote shapes (credential
  // helper rewrites, ssh:// with a bastion port, an :8443 GHES endpoint). The
  // guard keys on the hostname, so every shape must reach the same verdict.
  it.each([
    `https://${GHES_HOST}/org/repo`,
    `https://${GHES_HOST}/org/repo.git`,
    `https://${GHES_HOST}/org/repo/`,
    `https://${GHES_HOST}:8443/org/repo.git`,
    `https://x-access-token:ghp_TOKEN@${GHES_HOST}/org/repo.git`,
    `git@${GHES_HOST}:org/repo`,
    `git@${GHES_HOST}:org/repo.git`,
    `ssh://git@${GHES_HOST}/org/repo`,
    `ssh://git@${GHES_HOST}:2222/org/repo.git`,
    `git+ssh://git@${GHES_HOST}/org/repo.git`
  ])('rejects the enterprise host in remote form %s', (remoteUrl) => {
    expect(parseGiteaRepoRef(remoteUrl)).toBeNull()
  })

  it('still parses an ordinary Gitea host while the enterprise host is set', () => {
    expect(parseGiteaRepoRef('https://git.example.com/team/project.git')).toEqual({
      host: 'git.example.com',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://git.example.com/api/v1',
      webBaseUrl: 'https://git.example.com'
    })
  })

  it('keeps the enterprise host out of the resolved-remote path that clients call', async () => {
    gitExecFileAsyncMock.mockResolvedValue({
      stdout: `git@${GHES_HOST}:org/repo.git\n`,
      stderr: ''
    })

    await expect(getGiteaRepoRef('/repo')).resolves.toBeNull()
  })

  it('treats the same host as Gitea when no policy configures it', () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
    _resetGiteaRepoRefCache()

    expect(parseGiteaRepoRef(`https://${GHES_HOST}/org/repo.git`)).toMatchObject({
      host: GHES_HOST,
      owner: 'org',
      repo: 'repo',
      apiBaseUrl: `https://${GHES_HOST}/api/v1`
    })
  })
})

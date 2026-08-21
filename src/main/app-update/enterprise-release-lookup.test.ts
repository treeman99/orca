// Every way the corporate host can fail to answer must end the check silently.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getEnterprisePolicyMock, ghExecFileAsyncMock, storedHostMock } = vi.hoisted(() => ({
  getEnterprisePolicyMock: vi.fn(),
  ghExecFileAsyncMock: vi.fn(),
  storedHostMock: vi.fn()
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))
vi.mock('../github/gh-utils', () => ({ ghExecFileAsync: ghExecFileAsyncMock }))
vi.mock('../github/github-enterprise-host-store', () => ({
  readStoredGithubEnterpriseHost: () => storedHostMock()
}))

import {
  DEFAULT_RELEASE_REPOSITORY,
  lookupLatestEnterpriseRelease,
  releasePageUrl,
  resolveEnterpriseReleaseHost,
  resolveReleaseRepository
} from './enterprise-release-lookup'
import { makeEnterprisePolicy } from '../../shared/enterprise-policy-fixture'

const HOST = 'github.samsungds.net'

beforeEach(() => {
  ghExecFileAsyncMock.mockReset()
  storedHostMock.mockReset().mockReturnValue(null)
  getEnterprisePolicyMock
    .mockReset()
    .mockReturnValue(makeEnterprisePolicy({ githubEnterpriseHost: HOST }))
  delete process.env.GH_HOST
})

describe('resolveEnterpriseReleaseHost', () => {
  it('uses the policy host', () => {
    expect(resolveEnterpriseReleaseHost()).toBe(HOST)
  })

  it('refuses vendor SaaS rather than querying it', () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeEnterprisePolicy({ githubEnterpriseHost: 'github.com' })
    )
    expect(resolveEnterpriseReleaseHost()).toBeNull()
  })

  it('is null when nothing names a corporate host', () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
    expect(resolveEnterpriseReleaseHost()).toBeNull()
  })
})

describe('resolveReleaseRepository', () => {
  it("falls back to the build's own coordinate", () => {
    expect(resolveReleaseRepository()).toBe(DEFAULT_RELEASE_REPOSITORY)
  })

  it('honors the administrator override', () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeEnterprisePolicy({ updateReleaseRepository: 'Platform/Orca' })
    )
    expect(resolveReleaseRepository()).toBe('Platform/Orca')
  })
})

describe('releasePageUrl', () => {
  const release = { tag: 'v1.5.0', version: '1.5.0', releaseUrl: null }

  it('builds the corporate release page when the API gave none', () => {
    expect(releasePageUrl(release, HOST, 'DPI/Orcads')).toBe(
      `https://${HOST}/DPI/Orcads/releases/tag/v1.5.0`
    )
  })

  it("keeps the API's own URL when it is on the host we asked", () => {
    const url = `https://${HOST}/DPI/Orcads/releases/tag/v1.5.0`
    expect(releasePageUrl({ ...release, releaseUrl: url }, HOST, 'DPI/Orcads')).toBe(url)
  })

  it('discards an html_url pointing at another origin', () => {
    expect(
      releasePageUrl(
        { ...release, releaseUrl: 'https://github.com/stablyai/orca/releases/tag/v1.5.0' },
        HOST,
        'DPI/Orcads'
      )
    ).toBe(`https://${HOST}/DPI/Orcads/releases/tag/v1.5.0`)
  })
})

describe('lookupLatestEnterpriseRelease', () => {
  it('reports no host instead of calling gh', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
    await expect(lookupLatestEnterpriseRelease()).resolves.toEqual({
      outcome: 'no-enterprise-host'
    })
    expect(ghExecFileAsyncMock).not.toHaveBeenCalled()
  })

  it('reads releases through gh api on the corporate host', async () => {
    ghExecFileAsyncMock.mockResolvedValue({
      stdout: JSON.stringify([
        {
          tag_name: 'v1.5.0',
          html_url: `https://${HOST}/DPI/Orcads/releases/tag/v1.5.0`,
          draft: false,
          prerelease: false
        }
      ]),
      stderr: ''
    })
    const result = await lookupLatestEnterpriseRelease()
    expect(result).toMatchObject({
      outcome: 'found',
      host: HOST,
      releaseUrl: `https://${HOST}/DPI/Orcads/releases/tag/v1.5.0`
    })
    expect(ghExecFileAsyncMock).toHaveBeenCalledWith(
      ['api', 'repos/DPI/Orcads/releases?per_page=30'],
      expect.objectContaining({ host: HOST })
    )
  })

  it('falls back to tags when the releases list is empty', async () => {
    const readApi = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: 'v1.6.0' }])
    await expect(lookupLatestEnterpriseRelease({ readApi })).resolves.toMatchObject({
      outcome: 'found',
      release: { tag: 'v1.6.0', version: '1.6.0' }
    })
  })

  it('falls back to tags when releases 404s', async () => {
    const readApi = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 404: Not Found'))
      .mockResolvedValueOnce([{ name: 'v1.6.0' }])
    await expect(lookupLatestEnterpriseRelease({ readApi })).resolves.toMatchObject({
      outcome: 'found'
    })
  })

  it('reports lookup-failed when the host never answered (offline, 401, no gh)', async () => {
    for (const message of [
      'dial tcp: lookup github.samsungds.net: no such host',
      'HTTP 401: Bad credentials',
      'spawn gh ENOENT'
    ]) {
      const readApi = vi.fn().mockRejectedValue(new Error(message))
      await expect(lookupLatestEnterpriseRelease({ readApi })).resolves.toEqual({
        outcome: 'lookup-failed'
      })
    }
  })

  it('reports no-release for an answering repository with no usable tag', async () => {
    const readApi = vi.fn().mockResolvedValue([{ name: 'nightly' }, { name: 'latest' }])
    await expect(lookupLatestEnterpriseRelease({ readApi })).resolves.toEqual({
      outcome: 'no-release'
    })
  })

  it('reports no-release rather than a failure when only the tags fallback errors', async () => {
    const readApi = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('HTTP 404: Not Found'))
    await expect(lookupLatestEnterpriseRelease({ readApi })).resolves.toEqual({
      outcome: 'no-release'
    })
  })

  it('survives a non-JSON body from a captive portal', async () => {
    ghExecFileAsyncMock.mockResolvedValue({ stdout: '<html>login</html>', stderr: '' })
    await expect(lookupLatestEnterpriseRelease()).resolves.toEqual({ outcome: 'lookup-failed' })
  })
})

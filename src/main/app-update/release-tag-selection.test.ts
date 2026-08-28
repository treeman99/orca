import { describe, expect, it } from 'vitest'
import {
  isNewerRelease,
  parseReleaseListing,
  parseTagListing,
  releaseTagVersion,
  selectLatestStableRelease
} from './release-tag-selection'

describe('releaseTagVersion', () => {
  it('strips the conventional v prefix', () => {
    expect(releaseTagVersion('v1.4.186')).toBe('1.4.186')
    expect(releaseTagVersion('1.4.186')).toBe('1.4.186')
  })

  it('rejects anything that is not a semver core', () => {
    for (const tag of ['nightly', 'release-2026Q3', 'v1.4', 'v1.4.x', '', '   ']) {
      expect(releaseTagVersion(tag)).toBeNull()
    }
  })
})

describe('selectLatestStableRelease', () => {
  const candidate = (
    tag: string,
    extra: { draft?: boolean; prerelease?: boolean; releaseUrl?: string | null } = {}
  ) => ({
    tag,
    releaseUrl: extra.releaseUrl ?? null,
    draft: extra.draft ?? false,
    prerelease: extra.prerelease ?? false
  })

  it('picks the highest version regardless of listing order', () => {
    const selected = selectLatestStableRelease([
      candidate('v1.4.9'),
      candidate('v1.4.186'),
      candidate('v1.4.20')
    ])
    expect(selected).toEqual({ tag: 'v1.4.186', version: '1.4.186', releaseUrl: null })
  })

  it('skips drafts and prereleases flagged by the API', () => {
    const selected = selectLatestStableRelease([
      candidate('v2.0.0', { draft: true }),
      candidate('v1.9.0', { prerelease: true }),
      candidate('v1.4.186')
    ])
    expect(selected?.tag).toBe('v1.4.186')
  })

  it('skips a prerelease the tags fallback cannot flag', () => {
    const selected = selectLatestStableRelease([candidate('v2.0.0-rc.1'), candidate('v1.4.186')])
    expect(selected?.tag).toBe('v1.4.186')
  })

  it('ignores unparseable tags instead of treating them as newest', () => {
    expect(selectLatestStableRelease([candidate('nightly'), candidate('latest')])).toBeNull()
    expect(selectLatestStableRelease([candidate('nightly'), candidate('v1.0.0')])?.tag).toBe(
      'v1.0.0'
    )
  })

  it('returns null for an empty listing', () => {
    expect(selectLatestStableRelease([])).toBeNull()
  })

  it('carries the release page URL through', () => {
    const selected = selectLatestStableRelease([
      candidate('v1.5.0', {
        releaseUrl: 'https://github.samsungds.net/daegun-kim/Orca_ds/releases/tag/v1.5.0'
      })
    ])
    expect(selected?.releaseUrl).toBe(
      'https://github.samsungds.net/daegun-kim/Orca_ds/releases/tag/v1.5.0'
    )
  })
})

describe('parseReleaseListing', () => {
  it('narrows the GHES releases payload', () => {
    expect(
      parseReleaseListing([
        {
          tag_name: 'v1.4.186',
          html_url: 'https://github.samsungds.net/daegun-kim/Orca_ds/releases/tag/v1.4.186',
          draft: false,
          prerelease: false
        }
      ])
    ).toEqual([
      {
        tag: 'v1.4.186',
        releaseUrl: 'https://github.samsungds.net/daegun-kim/Orca_ds/releases/tag/v1.4.186',
        draft: false,
        prerelease: false
      }
    ])
  })

  it('drops entries with no tag and tolerates non-array payloads', () => {
    expect(parseReleaseListing([{ html_url: 'x' }, { tag_name: '   ' }])).toEqual([])
    expect(parseReleaseListing({ message: 'Not Found' })).toEqual([])
    expect(parseReleaseListing(null)).toEqual([])
    expect(parseReleaseListing('nope')).toEqual([])
  })
})

describe('parseTagListing', () => {
  it('reads the tags payload with no publication state', () => {
    expect(parseTagListing([{ name: 'v1.4.186' }, { name: '' }, 7])).toEqual([
      { tag: 'v1.4.186', releaseUrl: null, draft: false, prerelease: false }
    ])
  })
})

describe('isNewerRelease', () => {
  it('is true only for a strictly greater parseable version', () => {
    expect(isNewerRelease('1.4.186', '1.4.187')).toBe(true)
    expect(isNewerRelease('1.4.186', '1.4.186')).toBe(false)
    expect(isNewerRelease('1.4.187', '1.4.186')).toBe(false)
  })

  it('never reports an unparseable version as newer', () => {
    expect(isNewerRelease('1.4.186', 'nightly')).toBe(false)
    expect(isNewerRelease('nightly', '1.4.187')).toBe(false)
    expect(isNewerRelease('', '')).toBe(false)
  })
})

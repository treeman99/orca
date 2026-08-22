import { describe, expect, it } from 'vitest'
import {
  describeConfluenceBaseUrl,
  isConfluenceConfigured,
  normalizeConfluenceBaseUrl
} from './confluence-connection'

describe('normalizeConfluenceBaseUrl', () => {
  it('drops trailing slashes', () => {
    expect(normalizeConfluenceBaseUrl('https://confluence-mirror.samsungds.net/')).toBe(
      'https://confluence-mirror.samsungds.net'
    )
  })

  // People paste the URL they were reading in the API docs.
  it('drops a pasted REST suffix but keeps a context path', () => {
    expect(
      normalizeConfluenceBaseUrl('https://wiki.example.net/confluence/rest/api/content/12345')
    ).toBe('https://wiki.example.net/confluence')
    expect(normalizeConfluenceBaseUrl('https://wiki.example.net/confluence/')).toBe(
      'https://wiki.example.net/confluence'
    )
  })

  it('leaves an unparseable value alone rather than inventing one', () => {
    expect(normalizeConfluenceBaseUrl('  wiki.example.net/  ')).toBe('wiki.example.net')
    expect(normalizeConfluenceBaseUrl('   ')).toBe('')
  })
})

describe('describeConfluenceBaseUrl', () => {
  it('accepts a self-hosted https host', () => {
    expect(describeConfluenceBaseUrl('https://confluence-mirror.samsungds.net')).toBeNull()
  })

  // Empty is the unconfigured state, not an error the card should shout about.
  it('says nothing about an empty value', () => {
    expect(describeConfluenceBaseUrl('')).toBeNull()
    expect(describeConfluenceBaseUrl('   ')).toBeNull()
  })

  it('rejects a value that is not a URL', () => {
    expect(describeConfluenceBaseUrl('confluence-mirror')).toContain('full URL')
  })

  it('rejects a non-http scheme', () => {
    expect(describeConfluenceBaseUrl('ftp://wiki.example.net')).toContain('http')
  })

  // Cloud is a different API path and a different auth header; accepting it would store a
  // credential that can never work.
  it('rejects Atlassian Cloud outright', () => {
    expect(describeConfluenceBaseUrl('https://acme.atlassian.net/wiki')).toContain('Cloud')
  })
})

describe('isConfluenceConfigured', () => {
  it('needs both halves', () => {
    expect(
      isConfluenceConfigured({ confluenceBaseUrl: 'https://x.net', confluenceApiToken: 't' })
    ).toBe(true)
    expect(isConfluenceConfigured({ confluenceBaseUrl: 'https://x.net' })).toBe(false)
    expect(isConfluenceConfigured({ confluenceApiToken: 't' })).toBe(false)
    expect(isConfluenceConfigured({ confluenceBaseUrl: '  ', confluenceApiToken: '  ' })).toBe(
      false
    )
  })
})

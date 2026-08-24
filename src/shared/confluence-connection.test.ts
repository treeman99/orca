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

  // The 401 nobody could explain: the natural thing to paste is the page you are looking at,
  // and that whole path used to survive — so the probe called
  // `…/display/TEAM/Guide/rest/api/space`, which an SSO-fronted install answers with a login
  // challenge. A good token, a 401, and nothing pointing at the URL.
  it.each([
    ['https://wiki.example.net/display/TEAM/Build+Guide', 'https://wiki.example.net'],
    ['https://wiki.example.net/pages/viewpage.action?pageId=12345', 'https://wiki.example.net'],
    ['https://wiki.example.net/spaces/TEAM/pages/12345', 'https://wiki.example.net'],
    ['https://wiki.example.net/login.action?os_destination=%2F', 'https://wiki.example.net'],
    ['https://wiki.example.net/wiki', 'https://wiki.example.net'],
    // A real context path still survives — it is what comes BEFORE the wiki UI.
    ['https://wiki.example.net/confluence/display/TEAM/Page', 'https://wiki.example.net/confluence']
  ])('reduces a pasted page URL %s to its base', (pasted, expected) => {
    expect(normalizeConfluenceBaseUrl(pasted)).toBe(expected)
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

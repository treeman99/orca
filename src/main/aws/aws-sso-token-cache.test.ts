import { describe, expect, it } from 'vitest'
import {
  isAwsSsoTokenActive,
  normalizeAwsSsoExpiry,
  parseAwsSsoCacheEntry
} from './aws-sso-token-cache'

describe('normalizeAwsSsoExpiry', () => {
  it('keeps an ISO stamp as-is', () => {
    expect(normalizeAwsSsoExpiry('2026-07-27T12:00:00Z')).toBe('2026-07-27T12:00:00Z')
  })

  it('converts the older CLI’s "UTC" suffix into something Date can parse', () => {
    const normalized = normalizeAwsSsoExpiry('2026-07-27T12:00:00UTC')
    expect(normalized).toBe('2026-07-27T12:00:00Z')
    expect(Number.isNaN(Date.parse(normalized as string))).toBe(false)
  })

  it('rejects an unparseable value instead of reporting a bogus session', () => {
    expect(normalizeAwsSsoExpiry('soon')).toBeNull()
    expect(normalizeAwsSsoExpiry('   ')).toBeNull()
  })
})

describe('parseAwsSsoCacheEntry', () => {
  it('reads a token cache file', () => {
    expect(
      parseAwsSsoCacheEntry({
        startUrl: 'https://corp.awsapps.com/start',
        region: 'us-east-1',
        accessToken: 'aoeu',
        expiresAt: '2026-07-27T12:00:00Z'
      })
    ).toEqual({ startUrl: 'https://corp.awsapps.com/start', expiresAt: '2026-07-27T12:00:00Z' })
  })

  it('ignores the client registration file, which has an expiry but no session', () => {
    expect(
      parseAwsSsoCacheEntry({
        clientId: 'abc',
        clientSecret: 'shh',
        expiresAt: '2026-08-27T12:00:00Z'
      })
    ).toBeNull()
  })

  it('ignores an entry with no access token', () => {
    expect(
      parseAwsSsoCacheEntry({
        startUrl: 'https://corp.awsapps.com/start',
        expiresAt: '2026-07-27T12:00:00Z'
      })
    ).toBeNull()
  })

  it('ignores non-objects', () => {
    expect(parseAwsSsoCacheEntry(null)).toBeNull()
    expect(parseAwsSsoCacheEntry('{}')).toBeNull()
  })
})

describe('isAwsSsoTokenActive', () => {
  const now = new Date('2026-07-27T12:00:00Z')

  it('is active while the expiry is in the future', () => {
    expect(isAwsSsoTokenActive('2026-07-27T20:00:00Z', now)).toBe(true)
  })

  it('is not active once the expiry has passed', () => {
    expect(isAwsSsoTokenActive('2026-07-27T11:59:59Z', now)).toBe(false)
  })

  it('treats a missing or unparseable expiry as not signed in', () => {
    expect(isAwsSsoTokenActive(null, now)).toBe(false)
    expect(isAwsSsoTokenActive('whenever', now)).toBe(false)
  })
})

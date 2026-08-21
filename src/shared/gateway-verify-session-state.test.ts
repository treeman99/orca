import { describe, expect, it } from 'vitest'
import {
  findLabelledExpiry,
  normalizeGatewayExpiry,
  readTextSignedInSignal
} from './gateway-verify-session-state'

describe('normalizeGatewayExpiry', () => {
  it('rewrites a trailing UTC suffix to something Date parses', () => {
    expect(normalizeGatewayExpiry('2026-07-27T04:05:45UTC')).toBe('2026-07-27T04:05:45Z')
  })

  it('returns null for empty or unparseable input', () => {
    expect(normalizeGatewayExpiry('   ')).toBeNull()
    expect(normalizeGatewayExpiry('soon')).toBeNull()
  })
})

describe('findLabelledExpiry', () => {
  it('accepts a timestamp a label introduces', () => {
    expect(findLabelledExpiry('Expires at 2026-08-28T09:00:00Z')).toBe('2026-08-28T09:00:00Z')
    expect(findLabelledExpiry('valid_until=2026-08-28T09:00:00Z')).toBe('2026-08-28T09:00:00Z')
    expect(findLabelledExpiry('not_after 2026-08-28T09:00:00Z')).toBe('2026-08-28T09:00:00Z')
    expect(findLabelledExpiry('Token expiration: 2026-08-28T09:00:00Z')).toBe(
      '2026-08-28T09:00:00Z'
    )
  })

  it('rejects a timestamp no label introduces', () => {
    expect(findLabelledExpiry('2026-08-21T09:00:00Z [info] contacting gateway')).toBeNull()
    expect(findLabelledExpiry('Issued at 2026-08-21T09:00:00Z')).toBeNull()
    expect(findLabelledExpiry('Last used 2026-08-21T09:00:00Z')).toBeNull()
  })

  it('rejects a label sitting inside a negation', () => {
    expect(findLabelledExpiry('Token is not expired as of 2026-08-21T09:00:00Z')).toBeNull()
    expect(findLabelledExpiry('This key never expires; created 2026-01-01T00:00:00Z')).toBeNull()
  })

  it('skips a negated label and keeps looking on the same line', () => {
    expect(
      findLabelledExpiry('Not expired. Valid until 2026-08-28T09:00:00Z per the gateway.')
    ).toBe('2026-08-28T09:00:00Z')
  })
})

describe('readTextSignedInSignal', () => {
  it('reads an explicit signed-out statement', () => {
    for (const line of [
      'Not logged in.',
      'not signed-in',
      'unauthenticated',
      'No valid session for this profile.',
      'Login required.',
      'Please log in again.',
      'The session has expired.',
      'Token expired'
    ]) {
      expect(readTextSignedInSignal(line)).toBe(false)
    }
  })

  it('reads an explicit signed-in statement', () => {
    for (const line of [
      'Signed in as dev@corp.example',
      'You are authenticated.',
      'Session active',
      'Credentials are still valid'
    ]) {
      expect(readTextSignedInSignal(line)).toBe(true)
    }
  })

  it('does not read a neutral or negated expiry word as signed out', () => {
    for (const line of [
      'Your token expires in 6 days.',
      'Key expiration policy: 30 days',
      'Credential state: unexpired',
      'Token is not expired.',
      'Never expired.',
      'Expired sessions are pruned hourly.'
    ]) {
      expect(readTextSignedInSignal(line)).not.toBe(false)
    }
  })

  it('lets a negative statement win when both vocabularies appear', () => {
    expect(readTextSignedInSignal('You were logged in, but the session expired.')).toBe(false)
  })

  it('stays undecided on prose that states neither', () => {
    expect(readTextSignedInSignal('Contacting gateway.corp.example.com ...')).toBeNull()
  })
})

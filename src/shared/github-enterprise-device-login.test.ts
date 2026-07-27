import { describe, expect, it } from 'vitest'
import {
  ghDeviceVerificationUrl,
  outputAwaitsBrowserEnter,
  outputReportsLoginComplete,
  parseGhLoggedInAccount,
  parseGhOneTimeCode
} from './github-enterprise-device-login'

describe('parseGhOneTimeCode', () => {
  it('extracts and uppercases the one-time code', () => {
    expect(parseGhOneTimeCode('! First copy your one-time code: abcd-1234')).toBe('ABCD-1234')
    expect(parseGhOneTimeCode('one-time code: 1A2B-3C4D\nPress Enter...')).toBe('1A2B-3C4D')
  })

  it('returns null before the code is printed', () => {
    expect(parseGhOneTimeCode('- Logging into github.samsungds.net')).toBeNull()
  })
})

describe('outputAwaitsBrowserEnter', () => {
  it('detects the Enter prompt', () => {
    expect(
      outputAwaitsBrowserEnter('Press Enter to open github.samsungds.net in your browser...')
    ).toBe(true)
  })
  it('is false before the prompt', () => {
    expect(outputAwaitsBrowserEnter('! First copy your one-time code: ABCD-1234')).toBe(false)
  })
})

describe('parseGhLoggedInAccount', () => {
  it('reads the username from the older phrasing', () => {
    expect(parseGhLoggedInAccount('✓ Logged in as octocat')).toBe('octocat')
  })
  it('reads the username from the host-qualified phrasing', () => {
    expect(parseGhLoggedInAccount('✓ Logged in to github.samsungds.net as dev-user')).toBe(
      'dev-user'
    )
  })
  it('returns null when not yet logged in', () => {
    expect(parseGhLoggedInAccount('Press Enter to open ... in your browser')).toBeNull()
  })
})

describe('outputReportsLoginComplete', () => {
  it('is true on completion', () => {
    expect(outputReportsLoginComplete('✓ Authentication complete.')).toBe(true)
    expect(outputReportsLoginComplete('✓ Logged in as octocat')).toBe(true)
  })
  it('is false mid-flow', () => {
    expect(outputReportsLoginComplete('! First copy your one-time code: ABCD-1234')).toBe(false)
  })
})

describe('ghDeviceVerificationUrl', () => {
  it('builds the device URL for a host', () => {
    expect(ghDeviceVerificationUrl('github.samsungds.net')).toBe(
      'https://github.samsungds.net/login/device'
    )
  })
})

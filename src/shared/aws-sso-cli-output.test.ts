import { describe, expect, it } from 'vitest'
import {
  outputReportsSsoLoginComplete,
  parseAwsCliErrorMessage,
  parseAwsSsoUserCode,
  parseAwsSsoVerificationUrl
} from './aws-sso-cli-output'

const DEVICE_FLOW_OUTPUT = [
  'Attempting to automatically open the SSO authorization page in your default browser.',
  'If the browser does not open or you wish to use a different device to complete this authorization, open the following URL:',
  '',
  'https://device.sso.us-east-1.amazonaws.com/',
  '',
  'Then enter the code:',
  '',
  'WXYZ-1234',
  ''
].join('\n')

// AWS CLI v2 ≥ 2.22 defaults to authorization code + PKCE: a long URL, no code.
const PKCE_FLOW_OUTPUT = [
  'Attempting to automatically open the SSO authorization page in your default browser.',
  'If the browser does not open or you wish to use a different device to complete this authorization, open the following URL:',
  '',
  'https://oidc.us-east-1.amazonaws.com/authorize?response_type=code&client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A57764%2Foauth%2Fcallback&code_challenge=xyz',
  ''
].join('\n')

describe('parseAwsSsoUserCode', () => {
  it('reads the device code the CLI printed on its own line', () => {
    expect(parseAwsSsoUserCode(DEVICE_FLOW_OUTPUT)).toBe('WXYZ-1234')
  })

  it('uppercases a lowercase code', () => {
    expect(parseAwsSsoUserCode('Then enter the code:\n\nwxyz-1234')).toBe('WXYZ-1234')
  })

  it('returns null for the PKCE flow, which never prints a code', () => {
    expect(parseAwsSsoUserCode(PKCE_FLOW_OUTPUT)).toBeNull()
  })

  it('ignores a code-shaped token that is not the CLI announcing one', () => {
    expect(parseAwsSsoUserCode('Registered client ABCD-0000 with the portal')).toBeNull()
  })
})

describe('parseAwsSsoVerificationUrl', () => {
  it('reads the URL after the "open the following URL" line', () => {
    expect(parseAwsSsoVerificationUrl(DEVICE_FLOW_OUTPUT)).toBe(
      'https://device.sso.us-east-1.amazonaws.com/'
    )
  })

  it('keeps a long PKCE authorization URL intact, query string and all', () => {
    expect(parseAwsSsoVerificationUrl(PKCE_FLOW_OUTPUT)).toBe(
      'https://oidc.us-east-1.amazonaws.com/authorize?response_type=code&client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A57764%2Foauth%2Fcallback&code_challenge=xyz'
    )
  })

  it('falls back to an AWS sign-in endpoint when the wording is different', () => {
    expect(
      parseAwsSsoVerificationUrl('Visit https://device.sso.eu-west-1.amazonaws.com/ now')
    ).toBe('https://device.sso.eu-west-1.amazonaws.com/')
  })

  it('drops sentence punctuation that follows the URL', () => {
    expect(
      parseAwsSsoVerificationUrl('open the following URL: https://oidc.us-east-1.amazonaws.com/x.')
    ).toBe('https://oidc.us-east-1.amazonaws.com/x')
  })

  it('survives ANSI colour codes around the URL', () => {
    const esc = String.fromCharCode(27)
    expect(
      parseAwsSsoVerificationUrl(
        `open the following URL:\n${esc}[36mhttps://device.sso.us-east-1.amazonaws.com/${esc}[0m`
      )
    ).toBe('https://device.sso.us-east-1.amazonaws.com/')
  })

  it('returns null when nothing was printed yet', () => {
    expect(parseAwsSsoVerificationUrl('')).toBeNull()
  })
})

describe('outputReportsSsoLoginComplete', () => {
  it('recognizes the success line', () => {
    expect(
      outputReportsSsoLoginComplete(
        'Successfully logged into Start URL: https://corp.awsapps.com/start'
      )
    ).toBe(true)
  })

  it('stays false while the CLI is only waiting on the browser', () => {
    expect(outputReportsSsoLoginComplete(DEVICE_FLOW_OUTPUT)).toBe(false)
  })
})

describe('parseAwsCliErrorMessage', () => {
  it('reports a missing profile in the CLI’s own words', () => {
    expect(parseAwsCliErrorMessage('The config profile (bedrock) could not be found\n')).toBe(
      'The config profile (bedrock) could not be found'
    )
  })

  it('returns the last complaint when the CLI printed several', () => {
    const output = [
      'An error occurred (InvalidGrantException) when calling CreateToken',
      'Error loading SSO Token: Token for corp.awsapps.com is expired'
    ].join('\n')
    expect(parseAwsCliErrorMessage(output)).toBe(
      'Error loading SSO Token: Token for corp.awsapps.com is expired'
    )
  })

  it('returns null for ordinary progress output', () => {
    expect(parseAwsCliErrorMessage(PKCE_FLOW_OUTPUT)).toBeNull()
  })
})

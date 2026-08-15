import { describe, expect, it } from 'vitest'
import {
  normalizeGatewayExpiry,
  parseGatewayCliErrorMessage,
  parseGatewayUserCode,
  parseGatewayVerificationUrl,
  parseGatewayVerifyOutput,
  stripAnsi
} from './gateway-cli-output'

const ESC = String.fromCharCode(27)
const BOLD = `${ESC}[1m`
const RESET = `${ESC}[0m`

// What a PTY hands the login runner: colored prompts, a long PKCE URL, a code.
const LOGIN_OUTPUT = [
  `${BOLD}Opening your browser to complete sign-in.${RESET}`,
  'If it does not open, visit:',
  '',
  `${ESC}[4mhttps://gateway.corp.example.com/oidc/authorize?response_type=code&client_id=orca&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw${RESET}`,
  '',
  'Then confirm the code: WXYZ-1234',
  ''
].join('\r\n')

function verify(
  stdout: string,
  stderr = '',
  exitCode: number | null = 0
): ReturnType<typeof parseGatewayVerifyOutput> {
  return parseGatewayVerifyOutput({ stdout, stderr, exitCode })
}

describe('stripAnsi', () => {
  it('drops color sequences that would otherwise land inside a parsed value', () => {
    expect(stripAnsi(`${BOLD}hello${RESET}`)).toBe('hello')
  })
})

describe('parseGatewayVerificationUrl', () => {
  it('reads the first URL out of ANSI-decorated PTY output', () => {
    expect(parseGatewayVerificationUrl(LOGIN_OUTPUT)).toBe(
      'https://gateway.corp.example.com/oidc/authorize?response_type=code&client_id=orca&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw'
    )
  })

  it('trims sentence punctuation that is not part of the URL', () => {
    expect(parseGatewayVerificationUrl('Visit https://example.com/auth.')).toBe(
      'https://example.com/auth'
    )
    expect(parseGatewayVerificationUrl('Visit (https://example.com/auth),')).toBe(
      'https://example.com/auth'
    )
  })

  it('returns null when nothing was printed yet', () => {
    expect(parseGatewayVerificationUrl('Starting sign-in...')).toBeNull()
  })
})

describe('parseGatewayUserCode', () => {
  it('reads the confirmation code from ANSI-decorated PTY output', () => {
    expect(parseGatewayUserCode(LOGIN_OUTPUT)).toBe('WXYZ-1234')
  })

  it('reads a labelled code that is not in the four-four shape', () => {
    expect(parseGatewayUserCode('Enter code: ABC12345')).toBe('ABC12345')
  })

  it('uppercases a lowercase code', () => {
    expect(parseGatewayUserCode('Then enter the code:\n\nwxyz-1234')).toBe('WXYZ-1234')
  })

  // Regression guard: a PKCE query parameter can split four-four and is not a code.
  it('ignores four-four runs that live inside the authorization URL', () => {
    expect(
      parseGatewayUserCode('open https://example.com/authorize?client_id=abcd-efgh&x=1')
    ).toBeNull()
  })

  it('returns null for a flow that never prints a code', () => {
    expect(parseGatewayUserCode('Opening your browser to complete sign-in.')).toBeNull()
  })
})

describe('normalizeGatewayExpiry', () => {
  // Regression: the AWS CLI wrote this shape, and Date.parse returned Invalid Date.
  it('rewrites a trailing UTC suffix to Z', () => {
    expect(normalizeGatewayExpiry('2026-07-27T04:05:45UTC')).toBe('2026-07-27T04:05:45Z')
    expect(normalizeGatewayExpiry('2026-07-27T04:05:45 UTC')).toBe('2026-07-27T04:05:45Z')
    expect(Number.isNaN(Date.parse(normalizeGatewayExpiry('2026-07-27T04:05:45UTC') ?? ''))).toBe(
      false
    )
  })

  it('passes a real ISO stamp through', () => {
    expect(normalizeGatewayExpiry(' 2026-07-27T04:05:45Z ')).toBe('2026-07-27T04:05:45Z')
  })

  it('returns null for empty or unparseable input', () => {
    expect(normalizeGatewayExpiry('   ')).toBeNull()
    expect(normalizeGatewayExpiry('soon')).toBeNull()
  })
})

describe('parseGatewayCliErrorMessage', () => {
  it('returns the last complaint so a retry stack reports the final cause', () => {
    const output = 'Error: temporary failure\nRetrying...\nError: unauthorized tenant\n'
    expect(parseGatewayCliErrorMessage(output)).toBe('Error: unauthorized tenant')
  })

  it('returns null when nothing looks like an error', () => {
    expect(parseGatewayCliErrorMessage('Signed in.\n')).toBeNull()
  })

  it('masks a credential that appears on the failing line', () => {
    const message = parseGatewayCliErrorMessage('Error: invalid token=sk-live-abcdef1234567890\n')
    expect(message).not.toContain('sk-live-abcdef1234567890')
    expect(message).toContain('***')
  })
})

describe('parseGatewayVerifyOutput — JSON path', () => {
  it('reads camelCase fields', () => {
    expect(
      verify('{"signedIn":true,"expiresAt":"2026-07-27T04:05:45Z","identity":"dev@corp.example"}')
    ).toEqual({
      signedIn: true,
      expiresAt: '2026-07-27T04:05:45Z',
      identity: 'dev@corp.example',
      detail: null
    })
  })

  it('reads snake_case aliases and a stringy boolean', () => {
    const result = verify('{"active":"yes","not_after":"2026-07-27T04:05:45UTC","user":"dev"}')
    expect(result.signedIn).toBe(true)
    expect(result.expiresAt).toBe('2026-07-27T04:05:45Z')
    expect(result.identity).toBe('dev')
  })

  it('reads a nested session object', () => {
    const result = verify('{"session":{"authenticated":false,"principal":"dev@corp.example"}}')
    expect(result.signedIn).toBe(false)
    expect(result.identity).toBe('dev@corp.example')
  })

  it('ignores log lines printed around the JSON document', () => {
    const result = verify('checking...\n{"valid":true,"email":"dev@corp.example"}\ndone\n')
    expect(result.signedIn).toBe(true)
    expect(result.identity).toBe('dev@corp.example')
  })

  it('prefers a message field over the raw first line for detail', () => {
    expect(verify('{"ok":false,"message":"session expired"}').detail).toBe('session expired')
  })
})

describe('parseGatewayVerifyOutput — text path', () => {
  it('treats explicit sign-in wording as signed in', () => {
    const result = verify('Signed in as dev@corp.example\nExpires 2026-07-27T04:05:45Z\n')
    expect(result.signedIn).toBe(true)
    expect(result.expiresAt).toBe('2026-07-27T04:05:45Z')
    expect(result.detail).toBe('Signed in as dev@corp.example')
  })

  // "session expired, please log in again" carries both vocabularies at once.
  it('lets negative wording win over positive wording', () => {
    expect(
      verify('You were logged in, but the session expired. Please log in again.').signedIn
    ).toBe(false)
  })

  it('reads the negative verdict from stderr on a non-zero exit', () => {
    expect(verify('', 'not logged in\n', 1).signedIn).toBe(false)
  })

  it('normalizes a non-ISO expiry found in plain text', () => {
    expect(verify('Signed in. Valid until 2026-07-27T04:05:45UTC').expiresAt).toBe(
      '2026-07-27T04:05:45Z'
    )
  })
})

describe('parseGatewayVerifyOutput — exit-code fallback', () => {
  it('trusts a zero exit when nothing parsed', () => {
    expect(verify('ok\n', '', 0).signedIn).toBe(true)
  })

  it('trusts a non-zero exit when nothing parsed', () => {
    expect(verify('hmm\n', '', 7).signedIn).toBe(false)
  })

  it('treats a null exit code as not signed in', () => {
    expect(verify('', '', null).signedIn).toBe(false)
  })

  it('caps detail at 200 characters', () => {
    expect(verify(`${'a'.repeat(500)}\n`).detail?.length).toBe(200)
  })
})

describe('parseGatewayVerifyOutput — secret redaction', () => {
  const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef0123456789'

  it('never lets a virtual key reach identity or detail', () => {
    const result = verify(`{"signedIn":true,"identity":"dev@corp.example","virtualKey":"${TOKEN}"}`)
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(result.identity).toBe('dev@corp.example')
  })

  it('drops a secret-named field even when it is the only identity-ish key', () => {
    const result = verify(`{"signedIn":true,"apiToken":"${TOKEN}"}`)
    expect(result.identity).toBeNull()
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  it('masks an opaque credential printed in plain text', () => {
    const result = verify(`Signed in. virtual key: ${TOKEN}\n`)
    expect(result.detail).not.toContain(TOKEN)
    expect(result.detail).toContain('***')
  })

  it('masks a token that is the whole identity value', () => {
    expect(verify(`{"signedIn":true,"user":"${TOKEN}"}`).identity).toBeNull()
  })

  // Prose must survive: masking every long run would eat ordinary wording.
  it('leaves long credential-free wording alone', () => {
    expect(verify('AuthenticationSucceededCompletely for dev@corp.example\n').detail).toBe(
      'AuthenticationSucceededCompletely for dev@corp.example'
    )
  })
})

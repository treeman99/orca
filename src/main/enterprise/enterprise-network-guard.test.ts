import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeEnterprisePolicy, makeLockdownPolicy } from './enterprise-policy-fixture'

type BeforeRequestDetails = { url: string }
type BeforeRequestResponse = { cancel?: boolean }
type BeforeRequestListener = (
  details: BeforeRequestDetails,
  callback: (response: BeforeRequestResponse) => void
) => void

const onBeforeRequestMock = vi.fn<(listener: BeforeRequestListener) => void>()
const electronState: { defaultSession: unknown } = { defaultSession: null }

vi.mock('electron', () => ({
  session: {
    get defaultSession() {
      return electronState.defaultSession
    }
  }
}))

const getEnterprisePolicyMock = vi.fn(() => makeEnterprisePolicy())

vi.mock('./enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))

import {
  installEnterpriseNetworkGuard,
  resetEnterpriseNetworkGuardForTests
} from './enterprise-network-guard'

const REAL_FETCH = globalThis.fetch
const CORPORATE_HOST = 'github.corp.test'

function allowlistPolicy(hosts: string[] = [CORPORATE_HOST]) {
  return makeLockdownPolicy({ enforceNetworkAllowlist: true, allowedNetworkHosts: hosts })
}

function registeredListener(): BeforeRequestListener {
  const listener = onBeforeRequestMock.mock.calls.at(-1)?.[0]
  if (!listener) {
    throw new Error('the guard never registered an onBeforeRequest listener')
  }
  return listener
}

/** Runs the registered webRequest listener and returns what it told Chromium. */
function decide(url: string): BeforeRequestResponse {
  const responses: BeforeRequestResponse[] = []
  registeredListener()({ url }, (response) => responses.push(response))
  const [response] = responses
  if (!response) {
    throw new Error('the guard never invoked the webRequest callback')
  }
  return response
}

function stubFetch(): ReturnType<typeof vi.fn> {
  const upstream = vi.fn(async () => ({ ok: true }) as unknown as Response)
  globalThis.fetch = upstream as unknown as typeof globalThis.fetch
  return upstream
}

let stderrWrites: string[] = []

beforeEach(() => {
  onBeforeRequestMock.mockReset()
  getEnterprisePolicyMock.mockReset()
  getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
  electronState.defaultSession = { webRequest: { onBeforeRequest: onBeforeRequestMock } }
  stderrWrites = []
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderrWrites.push(String(chunk))
    return true
  })
})

afterEach(() => {
  resetEnterpriseNetworkGuardForTests()
  globalThis.fetch = REAL_FETCH
  vi.restoreAllMocks()
})

describe('installEnterpriseNetworkGuard', () => {
  it('is a no-op when the policy does not opt into the allowlist', () => {
    const upstream = stubFetch()
    // Lockdown alone must not arm it: a wrong allowlist breaks a deployment.
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())

    installEnterpriseNetworkGuard()

    expect(onBeforeRequestMock).not.toHaveBeenCalled()
    expect(globalThis.fetch).toBe(upstream)
  })

  it('allows a renderer request to an allowlisted host', () => {
    getEnterprisePolicyMock.mockReturnValue(allowlistPolicy())

    installEnterpriseNetworkGuard()

    expect(decide(`https://${CORPORATE_HOST}/api/v3/user`)).toEqual({})
  })

  it('cancels a renderer request to a host outside the allowlist', () => {
    getEnterprisePolicyMock.mockReturnValue(allowlistPolicy())

    installEnterpriseNetworkGuard()

    expect(decide('https://www.google.com/s2/favicons?domain=example.com')).toEqual({
      cancel: true
    })
  })

  it('logs the first block per host to stderr and dedupes the rest', () => {
    getEnterprisePolicyMock.mockReturnValue(allowlistPolicy())

    installEnterpriseNetworkGuard()
    decide('https://www.google.com/s2/favicons?domain=a.test')
    decide('https://www.google.com/s2/favicons?domain=b.test')
    decide('https://avatars.githubusercontent.com/u/1')

    expect(stderrWrites.filter((line) => line.includes('www.google.com'))).toHaveLength(1)
    expect(
      stderrWrites.filter((line) => line.includes('avatars.githubusercontent.com'))
    ).toHaveLength(1)
  })

  it('never blocks loopback, whatever the allowlist says', () => {
    getEnterprisePolicyMock.mockReturnValue(allowlistPolicy([]))

    installEnterpriseNetworkGuard()

    for (const url of [
      'http://localhost:5173/index.html',
      'http://127.0.0.1:8080/pair',
      'http://[::1]:9222/json/version',
      'http://orca.localhost/asset.js'
    ]) {
      expect(decide(url), url).toEqual({})
    }
  })

  it('never blocks non-http schemes', () => {
    getEnterprisePolicyMock.mockReturnValue(allowlistPolicy([]))

    installEnterpriseNetworkGuard()

    for (const url of [
      'file:///Applications/Orca.app/out/renderer/index.html',
      'devtools://devtools/bundled/inspector.js',
      'blob:file:///7f0c-4a1e',
      'data:image/svg+xml;base64,PHN2Zy8+',
      'chrome-extension://abcdef/background.js'
    ]) {
      expect(decide(url), url).toEqual({})
    }
  })

  it('registers a single webRequest listener across repeated installs', () => {
    getEnterprisePolicyMock.mockReturnValue(allowlistPolicy())

    installEnterpriseNetworkGuard()
    installEnterpriseNetworkGuard()

    // Electron keeps one onBeforeRequest slot per session; a re-register would
    // silently swap the live listener.
    expect(onBeforeRequestMock).toHaveBeenCalledTimes(1)
  })

  it('tolerates a missing default session and arms on a later call', () => {
    getEnterprisePolicyMock.mockReturnValue(allowlistPolicy())
    electronState.defaultSession = null

    expect(() => installEnterpriseNetworkGuard()).not.toThrow()

    electronState.defaultSession = { webRequest: { onBeforeRequest: onBeforeRequestMock } }
    installEnterpriseNetworkGuard()
    expect(decide('https://www.google.com/favicon.ico')).toEqual({ cancel: true })
  })
})

describe('installEnterpriseNetworkGuard fetch wrapper', () => {
  it('passes a main-process fetch to an allowlisted host through', async () => {
    const upstream = stubFetch()
    getEnterprisePolicyMock.mockReturnValue(allowlistPolicy())

    installEnterpriseNetworkGuard()
    await globalThis.fetch(`https://${CORPORATE_HOST}/api/v3/repos`)

    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('rejects a main-process fetch to a host outside the allowlist', async () => {
    const upstream = stubFetch()
    getEnterprisePolicyMock.mockReturnValue(allowlistPolicy())

    installEnterpriseNetworkGuard()

    await expect(globalThis.fetch('https://api.anthropic.com/v1/messages')).rejects.toThrow(
      /allowedNetworkHosts/
    )
    expect(upstream).not.toHaveBeenCalled()
    expect(stderrWrites.some((line) => line.includes('api.anthropic.com'))).toBe(true)
  })

  it('blocks a Request object and a URL, not just a string', async () => {
    stubFetch()
    getEnterprisePolicyMock.mockReturnValue(allowlistPolicy())

    installEnterpriseNetworkGuard()

    await expect(globalThis.fetch(new URL('https://telemetry.test/e'))).rejects.toThrow(
      /telemetry\.test/
    )
    await expect(
      globalThis.fetch({ url: 'https://telemetry.test/e' } as unknown as Request)
    ).rejects.toThrow(/telemetry\.test/)
  })

  it('does not double-wrap fetch when installed twice', () => {
    const upstream = stubFetch()
    getEnterprisePolicyMock.mockReturnValue(allowlistPolicy())

    installEnterpriseNetworkGuard()
    const wrapped = globalThis.fetch
    installEnterpriseNetworkGuard()

    expect(globalThis.fetch).toBe(wrapped)
    // One reset must restore the real fetch; a second wrapper would survive it.
    resetEnterpriseNetworkGuardForTests()
    expect(globalThis.fetch).toBe(upstream)
  })

  it('leaves fetch untouched when the allowlist is off', () => {
    const upstream = stubFetch()

    installEnterpriseNetworkGuard()

    expect(globalThis.fetch).toBe(upstream)
  })
})

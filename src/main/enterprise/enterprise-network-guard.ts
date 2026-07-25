// Opt-in hard network allowlist for locked-down corporate deployments.
//
// Two holes make this the fork's only real egress control: the packaged
// renderer ships no CSP (it loads favicon/avatar/attachment URLs straight from
// agent catalogs), and the corporate proxy in network/proxy-settings.ts is
// applied to the Electron session only — Node's global fetch, which several
// main-process clients use, never sees it.
//
// Scope is `session.defaultSession` on purpose. The embedded browser runs in
// `persist:` partitions (browser/browser-session-registry.ts) where
// BrowserCertificateRequestGuard already owns the single onBeforeRequest slot;
// a second registration there would silently replace that certificate gate.
// Browsing arbitrary sites is the embedded browser's job, so it stays exempt.
//
// This switch is never inherited from `lockdown`: a wrong allowlist breaks a
// deployment in ways the feature switches cannot, so an admin opts in.

import { session } from 'electron'

import { getEnterprisePolicy } from './enterprise-policy-file'

type GlobalFetch = typeof globalThis.fetch

// Reached through Reflect so the global-fetch call-site audit keeps counting
// real HTTP call sites rather than this wrapper.
const FETCH_PROPERTY = 'fetch'

// Enough to identify a misconfigured allowlist; a hostile page must not be able
// to grow this set without bound by walking hostnames.
const MAX_REPORTED_HOSTS = 256

const reportedHosts = new Set<string>()
let originalFetch: GlobalFetch | null = null
let sessionGuardInstalled = false

function reportBlocked(host: string, lane: string): void {
  if (reportedHosts.has(host) || reportedHosts.size >= MAX_REPORTED_HOSTS) {
    return
  }
  reportedHosts.add(host)
  // A silent allowlist is undebuggable; one line per host, not per request.
  process.stderr.write(
    `[enterprise-network] blocked ${lane} to ${host}: not in allowedNetworkHosts\n`
  )
}

function isLoopbackHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0.0.0.0' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  )
}

/** Bracketless, lowercase host of an http(s) URL; null when the allowlist does not apply. */
function guardedHost(rawUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    // Unparseable: let the caller's own error surface instead of inventing one.
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return !host || isLoopbackHost(host) ? null : host
}

/** The host to block, or null when the request is allowed through. */
function blockedHost(rawUrl: string, allowed: ReadonlySet<string>): string | null {
  const host = guardedHost(rawUrl)
  return host !== null && !allowed.has(host) ? host : null
}

function installSessionGuard(allowed: ReadonlySet<string>): void {
  if (sessionGuardInstalled) {
    return
  }
  const defaultSession = session.defaultSession
  if (!defaultSession) {
    return
  }
  defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const host = blockedHost(details.url, allowed)
    if (host === null) {
      callback({})
      return
    }
    reportBlocked(host, 'renderer request')
    callback({ cancel: true })
  })
  sessionGuardInstalled = true
}

function installFetchGuard(allowed: ReadonlySet<string>): void {
  const current = Reflect.get(globalThis, FETCH_PROPERTY) as GlobalFetch | undefined
  if (originalFetch !== null || typeof current !== 'function') {
    return
  }
  originalFetch = current
  const passthrough = current
  const guarded: GlobalFetch = (input, init) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const host = blockedHost(rawUrl, allowed)
    if (host !== null) {
      reportBlocked(host, 'main-process fetch')
      return Promise.reject(
        new Error(
          `Enterprise network allowlist blocked a request to ${host}. ` +
            'Add it to "allowedNetworkHosts" in the Orca enterprise policy file.'
        )
      )
    }
    return passthrough(input, init)
  }
  Reflect.set(globalThis, FETCH_PROPERTY, guarded)
}

/**
 * Arm the allowlist for this process. A no-op unless the policy file opts in,
 * and safe to call more than once.
 */
export function installEnterpriseNetworkGuard(): void {
  const policy = getEnterprisePolicy()
  if (!policy.enforceNetworkAllowlist) {
    return
  }
  const allowed = new Set(policy.allowedNetworkHosts)
  installSessionGuard(allowed)
  installFetchGuard(allowed)
}

/** Exposed for tests only — restores the real fetch and forgets install state. */
export function resetEnterpriseNetworkGuardForTests(): void {
  if (originalFetch !== null) {
    Reflect.set(globalThis, FETCH_PROPERTY, originalFetch)
    originalFetch = null
  }
  sessionGuardInstalled = false
  reportedHosts.clear()
}

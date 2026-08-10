import { app } from 'electron'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'
import { ORCA_CLOUD_REMOVED, ORCA_CLOUD_REMOVED_MESSAGE } from '../../shared/orca-cloud-removal'

export type OrcaCloudAuthConfig = {
  apiBaseUrl: string
  authorizeEndpoint: string
  sessionEndpoint: string
  refreshEndpoint: string
  capabilitiesEndpoint: string
  profileEndpoint: string
  orgEndpoint: string
  logoutEndpoint: string
  relayTokenEndpoint: string
  relayDirectorUrl: string
  clientId: string
  scope: string
}

const DEFAULT_SCOPE = 'openid profile email offline_access'
// The upstream packaged-build fallbacks — the vendor sign-in host, its OAuth client id, and the
// relay director origin, all named in shared/orca-cloud-removal — are deleted rather than left
// unused, so those hosts are absent from the shipped bundle and a reviewer grepping it finds
// nothing to assess. With them gone a packaged build resolves no endpoint at all, which is the
// same `configured: false` the guard above already returns. The test asserts this file stays free
// of the literals, so keep the hostnames in the removal module rather than repeating them here.

// Why: packaged main bundles never define NODE_ENV, so packaged-ness is the
// only reliable production signal for gating dev-only auth escape hatches.
function isPackagedOrcaBuild(): boolean {
  try {
    return app?.isPackaged === true
  } catch {
    return false
  }
}

function cleanUrl(value: string | undefined, allowLoopbackHttp: boolean): string | null {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }
  try {
    const parsed = new URL(trimmed)
    const loopbackHost =
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '[::1]'
    if (parsed.protocol !== 'https:' && !(loopbackHost && allowLoopbackHttp)) {
      return null
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function endpoint(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl}/`).toString()
}

function cleanOrigin(value: string | undefined, allowLoopbackHttp: boolean): string | null {
  const cleaned = cleanUrl(value, allowLoopbackHttp)
  if (!cleaned) {
    return null
  }
  const parsed = new URL(cleaned)
  return parsed.pathname === '/' && !parsed.search && !parsed.hash ? parsed.origin : null
}

export function getOrcaCloudAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedOrcaBuild()
): { configured: true; config: OrcaCloudAuthConfig } | { configured: false; setupMessage: string } {
  // This build removes vendor cloud sign-in outright, ahead of the policy check below so no
  // administrator setting can restore it. Same chokepoint, same reason it is the right one: an
  // unconfigured cloud also keeps the desktop mobile relay from starting, so no corporate
  // terminal can be bridged to a phone and no relay-backed pairing invite is ever minted.
  if (ORCA_CLOUD_REMOVED) {
    return { configured: false, setupMessage: ORCA_CLOUD_REMOVED_MESSAGE }
  }
  if (getEnterprisePolicy().disableCloudRelay) {
    return {
      configured: false,
      setupMessage: 'Orca Cloud sign-in is disabled by an enterprise policy.'
    }
  }
  // Why: loopback HTTP endpoints are a local-development convenience only;
  // packaged builds must not accept plain-HTTP token endpoints via env vars.
  const allowLoopbackHttp = !packaged
  const cleanEndpointUrl = (value: string | undefined): string | null =>
    cleanUrl(value, allowLoopbackHttp)
  const configuredApiBaseUrl = env.ORCA_CLOUD_API_URL?.trim()
  // No packaged fallback: with the vendor endpoint deleted there is nothing to fall back to, so a
  // packaged build reports the cloud unconfigured unless someone points it at their own host.
  const apiBaseUrl = configuredApiBaseUrl ? cleanEndpointUrl(configuredApiBaseUrl) : null
  const clientId = env.ORCA_CLOUD_CLIENT_ID?.trim()
  if (!apiBaseUrl || !clientId) {
    return {
      configured: false,
      setupMessage: 'Orca Cloud sign-in is not configured for this build.'
    }
  }

  const authBaseUrl = cleanEndpointUrl(env.ORCA_CLOUD_AUTH_URL) ?? apiBaseUrl
  return {
    configured: true,
    config: {
      apiBaseUrl,
      authorizeEndpoint:
        cleanEndpointUrl(env.ORCA_CLOUD_AUTHORIZE_URL) ??
        endpoint(authBaseUrl, '/v1/desktop/auth/authorize'),
      sessionEndpoint:
        cleanEndpointUrl(env.ORCA_CLOUD_SESSION_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/session'),
      refreshEndpoint:
        cleanEndpointUrl(env.ORCA_CLOUD_REFRESH_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/refresh'),
      capabilitiesEndpoint:
        cleanEndpointUrl(env.ORCA_CLOUD_CAPABILITIES_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/capabilities'),
      profileEndpoint:
        cleanEndpointUrl(env.ORCA_CLOUD_PROFILE_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/profile'),
      orgEndpoint:
        cleanEndpointUrl(env.ORCA_CLOUD_ORG_URL) ?? endpoint(apiBaseUrl, '/v1/desktop/auth/org'),
      logoutEndpoint:
        cleanEndpointUrl(env.ORCA_CLOUD_LOGOUT_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/logout'),
      relayTokenEndpoint:
        cleanEndpointUrl(env.ORCA_CLOUD_RELAY_TOKEN_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/relay-token'),
      // Empty when unset, where the vendor director used to be: the relay broker gets no host to
      // dial rather than silently falling back to one.
      relayDirectorUrl: cleanOrigin(env.ORCA_RELAY_URL, allowLoopbackHttp) ?? '',
      clientId,
      scope: env.ORCA_CLOUD_AUTH_SCOPE?.trim() || DEFAULT_SCOPE
    }
  }
}

export function allowsPlaintextOrcaCloudSession(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedOrcaBuild()
): boolean {
  return (
    env.ORCA_CLOUD_ALLOW_PLAINTEXT_SESSION === '1' && env.NODE_ENV !== 'production' && !packaged
  )
}

export function isOrcaCloudDevAuthEnabled(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedOrcaBuild()
): boolean {
  return env.ORCA_CLOUD_DEV_AUTH === '1' && env.NODE_ENV !== 'production' && !packaged
}

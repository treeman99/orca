// Verifying a Confluence credential from the settings pane.
//
// One request, user-initiated, from the MAIN process on purpose: a token the user believes is
// saved but that nobody ever exercised is a bot failure hours later, and a main-process fetch
// is the lane `enforceNetworkAllowlist` can actually see (a child process is not).
//
// Server / Data Center only — `/rest/api/space?limit=1` is the cheapest authenticated read
// that exists on every install and returns nothing sensitive.

import {
  normalizeConfluenceBaseUrl,
  type ConfluenceConnectionTestResult
} from '../../shared/confluence-connection'

export type { ConfluenceConnectionTestResult }

const REQUEST_TIMEOUT_MS = 15_000

/**
 * Same-origin hops this follows itself before giving up.
 *
 * Why manual instead of letting fetch follow: the spec strips `Authorization` when a redirect
 * CHANGES ORIGIN, and http→https counts. So an install that redirects to its canonical URL
 * answers the retry with no credential at all, and the user sees a 401 for a token that is
 * perfectly good. Measured against a local redirect pair — the second hop arrived with
 * `authorization: null`. Following same-origin hops keeps a context-path or trailing-slash
 * redirect working; a cross-origin hop is reported with the URL to use instead.
 */
const MAX_SAME_ORIGIN_REDIRECTS = 3

function redirectTarget(response: Response, from: string): string | null {
  const location = response.headers.get('location')
  if (!location) {
    return null
  }
  try {
    return new URL(location, from).toString()
  } catch {
    return null
  }
}

export async function testConfluenceConnection(input: {
  baseUrl: string
  token: string
  // Injected so the test suite never reaches the network.
  fetchImpl?: typeof fetch
}): Promise<ConfluenceConnectionTestResult> {
  const baseUrl = normalizeConfluenceBaseUrl(input.baseUrl)
  const token = input.token.trim()
  if (!baseUrl || !token) {
    return {
      ok: false,
      reason: 'not_configured',
      message: 'Enter both the base URL and a token first.'
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const doFetch = input.fetchImpl ?? fetch
    let requestUrl = `${baseUrl}/rest/api/space?limit=1`
    let response = await doFetch(requestUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'manual',
      signal: controller.signal
    })
    for (
      let hop = 0;
      hop < MAX_SAME_ORIGIN_REDIRECTS && response.status >= 300 && response.status < 400;
      hop += 1
    ) {
      const target = redirectTarget(response, requestUrl)
      if (!target) {
        break
      }
      if (new URL(target).origin !== new URL(requestUrl).origin) {
        const suggested = normalizeConfluenceBaseUrl(target)
        return {
          ok: false,
          reason: 'redirected',
          // Naming the target is the whole point: following it would drop the token and report
          // the resulting 401 as a bad credential.
          message: `That URL redirects to ${new URL(target).origin}, which would discard the token. Use that address as the base URL.`,
          ...(suggested ? { suggestedBaseUrl: suggested } : {})
        }
      }
      requestUrl = target
      response = await doFetch(requestUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'manual',
        signal: controller.signal
      })
    }
    if (response.status >= 300 && response.status < 400) {
      return {
        ok: false,
        reason: 'redirected',
        message: `That URL keeps redirecting (HTTP ${response.status}). Check the base URL with your Confluence administrator.`
      }
    }
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        reason: 'unauthorized',
        message: `The server rejected the token (HTTP ${response.status}).`
      }
    }
    if (!response.ok) {
      // A 404 here usually means the base URL is missing a context path, which is the most
      // common paste mistake — say that rather than the bare status.
      return {
        ok: false,
        reason: response.status === 404 ? 'not_found' : 'network',
        message:
          response.status === 404
            ? 'No Confluence API at that URL. If your install sits under a path, include it (…/confluence).'
            : `The server answered HTTP ${response.status}.`
      }
    }
    // The body is not needed beyond proving the token was accepted; a space name is a friendly
    // confirmation that this is the wiki the user meant.
    const body = (await response.json().catch(() => null)) as {
      results?: { name?: unknown }[]
    } | null
    const name = body?.results?.[0]?.name
    return { ok: true, displayName: typeof name === 'string' ? name : null }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return {
      ok: false,
      reason: 'network',
      message: aborted
        ? 'The server did not answer in time. Check the URL and whether you are on the corporate network.'
        : error instanceof Error
          ? error.message
          : String(error)
    }
  } finally {
    clearTimeout(timer)
  }
}

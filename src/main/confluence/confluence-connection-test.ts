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
    const response = await (input.fetchImpl ?? fetch)(`${baseUrl}/rest/api/space?limit=1`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    })
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

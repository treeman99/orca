// Validating and normalizing the self-hosted Confluence base URL.
//
// Pure and shared so the settings card, and whatever later builds a request from it, agree on
// what a usable value is. A URL that only fails at request time is a token the user believes
// is configured.

/**
 * Path segments that mean "you are now inside the wiki UI", not "this is the base".
 *
 * Why this list rather than just stripping the REST suffix: the natural thing to paste is the
 * page you are looking at. `…/display/TEAM/Build+Guide` kept its whole path, so the probe
 * called `…/display/TEAM/Build+Guide/rest/api/space` — which an SSO-fronted install answers
 * with a login challenge, i.e. **401 for a perfectly good token**. Everything BEFORE the first
 * of these is kept, because that is where a real context path (`/confluence`) lives.
 */
const CONFLUENCE_UI_PATH_SEGMENTS = new Set([
  'display',
  'pages',
  'spaces',
  'wiki',
  'label',
  'plugins',
  'rest',
  'x'
])

/** Trailing slashes, a pasted page/REST path, and any query or fragment are stripped. */
export function normalizeConfluenceBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  try {
    const url = new URL(trimmed)
    const segments = url.pathname.split('/').filter(Boolean)
    const kept: string[] = []
    for (const segment of segments) {
      // `*.action` is Confluence's own UI/servlet layer (login.action, viewpage.action, …) and
      // is never part of a base URL.
      if (CONFLUENCE_UI_PATH_SEGMENTS.has(segment.toLowerCase()) || segment.endsWith('.action')) {
        break
      }
      kept.push(segment)
    }
    return kept.length > 0 ? `${url.origin}/${kept.join('/')}` : url.origin
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

/**
 * A human-readable problem with the URL, or null when it is usable.
 *
 * An empty value is not a problem — it is the unconfigured state, and the card already says so.
 */
export function describeConfluenceBaseUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return 'Enter a full URL, for example https://confluence-mirror.samsungds.net'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'Use an http or https URL.'
  }
  if (!url.hostname) {
    return 'That URL has no host.'
  }
  // Cloud is a different API path and a different auth header; accepting it here would store a
  // credential that can never work.
  if (url.hostname.endsWith('.atlassian.net')) {
    return 'Atlassian Cloud is not supported here — this build talks to a self-hosted Confluence.'
  }
  return null
}

export type ConfluenceConnectionTestResult =
  | { ok: true; displayName: string | null }
  | {
      ok: false
      reason: 'not_configured' | 'unauthorized' | 'not_found' | 'redirected' | 'network'
      message: string
      /** For `redirected`: the base URL to use instead, ready to paste back into the field. */
      suggestedBaseUrl?: string
    }

/** Whether both halves of the credential are present. */
export function isConfluenceConfigured(settings: {
  confluenceBaseUrl?: string
  confluenceApiToken?: string
}): boolean {
  return Boolean(settings.confluenceBaseUrl?.trim() && settings.confluenceApiToken?.trim())
}

// Validating and normalizing the self-hosted Confluence base URL.
//
// Pure and shared so the settings card, and whatever later builds a request from it, agree on
// what a usable value is. A URL that only fails at request time is a token the user believes
// is configured.

/** Trailing slashes and a pasted `/wiki` or REST path are stripped; the base is the origin. */
export function normalizeConfluenceBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  try {
    const url = new URL(trimmed)
    // Server/DC installs are usually at the origin, but a mirror can sit under a context path
    // (…/confluence). Keep the path, drop only the REST suffix people paste from docs.
    const path = url.pathname.replace(/\/+$/, '').replace(/\/rest\/api.*$/, '')
    return `${url.origin}${path}`
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

/** Whether both halves of the credential are present. */
export function isConfluenceConfigured(settings: {
  confluenceBaseUrl?: string
  confluenceApiToken?: string
}): boolean {
  return Boolean(settings.confluenceBaseUrl?.trim() && settings.confluenceApiToken?.trim())
}

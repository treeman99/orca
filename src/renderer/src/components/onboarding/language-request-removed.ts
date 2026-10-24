// Fork-owned: upstream sends onboarding language requests through the vendor feedback endpoint
// (`feedback:submit`), which this build removed with the rest of feedback submission (README §6).
// Typed `boolean`, not `false`, so the upstream request view keeps compiling and its tests can
// re-enable it through this seam.
export const LANGUAGE_REQUESTS_AVAILABLE: boolean = false

const LANGUAGE_REQUESTS_UNAVAILABLE = 'language_requests_unavailable'

export async function submitLanguageRequest(_request: {
  feedback: string
  submitAnonymously: boolean
  githubLogin: null
  githubEmail: null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // Never shown: the request view is withheld while LANGUAGE_REQUESTS_AVAILABLE is false.
  return { ok: false, error: LANGUAGE_REQUESTS_UNAVAILABLE }
}

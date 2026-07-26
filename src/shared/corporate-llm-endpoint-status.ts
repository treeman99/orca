// Renderer-facing view of the self-hosted model endpoints an administrator
// provisions through the corporate policy file.
//
// `hasToken` is the ONLY thing the renderer ever learns about a token. The token
// itself stays in main (src/main/enterprise/corporate-llm-token-store.ts):
// whatever the renderer can read, a compromised renderer can exfiltrate.

import type { EnterpriseLlmEndpoint } from './enterprise-llm-endpoints'

export type CorporateLlmEndpointStatus = EnterpriseLlmEndpoint & {
  /** Whether this user has a token saved for the endpoint — never the token. */
  readonly hasToken: boolean
}

/**
 * Why the write was refused, in terms the user can act on.
 * `encryption-unavailable` is its own case because the store deliberately refuses
 * to write a plaintext token, and the user is owed that explanation rather than a
 * generic failure they would retry forever.
 */
export type CorporateLlmTokenSaveFailure =
  | 'unknown-endpoint'
  | 'encryption-unavailable'
  | 'write-failed'

export type CorporateLlmTokenSaveResult =
  | { readonly ok: true; readonly hasToken: boolean }
  | { readonly ok: false; readonly reason: CorporateLlmTokenSaveFailure }

// Publishes the administrator-provisioned endpoints into the session-option
// catalog so they appear in the model picker.
//
// Only ids and labels cross the IPC boundary — `hasToken` is a boolean, and the
// token itself never leaves main. A missing token is surfaced here as a picker
// sub-label rather than by hiding the endpoint: hiding it would leave a user who
// has not entered their token yet with no way to discover that they must.

import { registerCorporateLlmEndpoints } from '../../../shared/corporate-llm-session-catalog'
import type { CorporateLlmEndpointStatus } from '../../../shared/corporate-llm-endpoint-status'
import { i18n, translate } from '@/i18n/i18n'

let lastKnownEndpoints: readonly CorporateLlmEndpointStatus[] = []

function describe(endpoint: CorporateLlmEndpointStatus): string {
  return endpoint.hasToken
    ? translate(
        'enterprise.corporateLlm.appliesNextSession',
        'Company-hosted model — applies from the next session'
      )
    : translate(
        'enterprise.corporateLlm.tokenMissing',
        'Company-hosted model — save your token in Settings first'
      )
}

function publish(endpoints: readonly CorporateLlmEndpointStatus[]): void {
  lastKnownEndpoints = endpoints
  registerCorporateLlmEndpoints(
    endpoints.map((endpoint) => ({
      id: endpoint.id,
      label: endpoint.label,
      description: describe(endpoint)
    }))
  )
}

/**
 * Load the endpoints once at startup. Resolves after registration so a caller can
 * await it; failures leave the catalog untouched, which is the non-corporate shape.
 */
export async function syncCorporateLlmEndpoints(): Promise<void> {
  try {
    publish((await window.api?.corporateLlm?.listEndpoints?.()) ?? [])
  } catch {
    // A build without the corporate IPC surface simply has no endpoints.
  }
}

export function startCorporateLlmEndpointSync(): void {
  void syncCorporateLlmEndpoints()
  // Why: the picker sub-label is localized, but the UI language loads after this
  // module does, so re-register once the catalog it was rendered from changes.
  i18n.on('languageChanged', () => publish(lastKnownEndpoints))
}

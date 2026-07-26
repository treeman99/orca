// Resolves a session's "use the company's own model" choice at spawn time.
//
// The choice travels as ORCA_CORPORATE_LLM_ENDPOINT=<endpoint id>, which is NOT a
// secret and is therefore safe to keep in per-workspace launch config — and that
// matters, because SleepingAgentLaunchConfig persists agentEnv to durable resume
// state in plaintext (src/shared/sleeping-agent-launch-config.ts). The token is
// never part of that: main looks it up here, from the user's encrypted store,
// and merges it into the environment on its way to the PTY.

import {
  corporateLlmLaunchEnv,
  CORPORATE_LLM_ENDPOINT_ENV
} from '../../shared/corporate-llm-launch-env'
import type { EnterpriseLlmEndpoint } from '../../shared/enterprise-llm-endpoints'
import { getEnterprisePolicy } from './enterprise-policy-file'
import { readCorporateLlmToken } from './corporate-llm-token-store'

export { CORPORATE_LLM_ENDPOINT_ENV }

export type CorporateLlmSelection =
  | { kind: 'none' }
  | { kind: 'applied'; endpoint: EnterpriseLlmEndpoint }
  | { kind: 'unknown-endpoint'; id: string }
  | { kind: 'missing-token'; endpoint: EnterpriseLlmEndpoint }

type Dependencies = {
  endpoints: readonly EnterpriseLlmEndpoint[]
  readToken: (endpointId: string) => string | null
}

function defaultDependencies(): Dependencies {
  return { endpoints: getEnterprisePolicy().llmEndpoints, readToken: readCorporateLlmToken }
}

/**
 * Merge the selected endpoint's variables into `env`, in place.
 *
 * Returns what happened so the caller can report it. When the selection cannot be
 * honored the environment is left untouched: the launch then uses whatever backend
 * the workspace already had (on this fleet, Bedrock), which is a sanctioned path —
 * far better than failing the spawn or sending an unauthenticated request.
 */
export function applyCorporateLlmSelection(
  env: Record<string, string>,
  dependencies: Dependencies = defaultDependencies()
): CorporateLlmSelection {
  const selectedId = env[CORPORATE_LLM_ENDPOINT_ENV]?.trim()
  if (!selectedId) {
    return { kind: 'none' }
  }
  const endpoint = dependencies.endpoints.find((candidate) => candidate.id === selectedId)
  if (!endpoint) {
    return { kind: 'unknown-endpoint', id: selectedId }
  }
  const token = dependencies.readToken(endpoint.id)
  if (!token) {
    return { kind: 'missing-token', endpoint }
  }
  Object.assign(env, corporateLlmLaunchEnv({ endpoint, token, baseEnv: env }))
  return { kind: 'applied', endpoint }
}

/** Operator-facing description of a selection outcome. Never includes the token. */
export function describeCorporateLlmSelection(selection: CorporateLlmSelection): string | null {
  switch (selection.kind) {
    case 'none':
      return null
    case 'applied':
      return `using corporate LLM endpoint "${selection.endpoint.id}" (${selection.endpoint.baseUrl})`
    case 'unknown-endpoint':
      return `ignoring unknown corporate LLM endpoint "${selection.id}" — it is not in the policy file's llmEndpoints`
    case 'missing-token':
      return `no token saved for corporate LLM endpoint "${selection.endpoint.id}" — the launch keeps its existing backend`
  }
}

// Makes the company's self-hosted endpoints choosable from the model picker the
// user already uses, instead of requiring someone to set ORCA_CORPORATE_LLM_ENDPOINT
// by hand.
//
// An endpoint is modeled as a MODEL, not as a per-model option, for two reasons.
// A user picks one backend for a session, so "Sonnet AND the in-house model" is not
// a state that exists. And a model-scoped option is silently lost whenever no model
// was ever explicitly chosen: resolveNativeChatSessionOptionDefaults returns nothing
// without a persisted model id, and the live surface can only persist an option
// under a model it already knows. A model id has neither problem.
//
// The endpoint list is administrator-owned and arrives at runtime — from the policy
// file in main, over IPC in the renderer — so it is registered here rather than
// written into the static per-agent catalogs.
//
// Only the endpoint ID is ever placed in the launch environment. The token stays in
// main (src/main/enterprise/corporate-llm-token-store.ts) and is resolved at spawn.

import type {
  AgentSessionOptionCatalog,
  CatalogModel,
  CatalogOptionApply
} from './agent-session-option-catalog-types'
import { CORPORATE_LLM_ENDPOINT_ENV } from './corporate-llm-launch-env'
import type { EnterpriseLlmEndpoint } from './enterprise-llm-endpoints'

/** Namespaced so a corporate id can never collide with a vendor model id. */
const MODEL_ID_PREFIX = 'orca-corporate-llm:'

export type CorporateLlmCatalogEndpoint = Pick<EnterpriseLlmEndpoint, 'id' | 'label'> & {
  /** Localized picker sub-label. Registered by the renderer; main renders nothing. */
  readonly description?: string
}

export function corporateLlmModelId(endpointId: string): string {
  return `${MODEL_ID_PREFIX}${endpointId}`
}

export function corporateLlmEndpointIdFromModelId(modelId: string): string | null {
  return modelId.startsWith(MODEL_ID_PREFIX) ? modelId.slice(MODEL_ID_PREFIX.length) : null
}

let registeredEndpoints: readonly CorporateLlmCatalogEndpoint[] = []
let decorated = new WeakMap<AgentSessionOptionCatalog, AgentSessionOptionCatalog>()

/** Publish the endpoints an administrator provisioned. Re-registering replaces them. */
export function registerCorporateLlmEndpoints(
  endpoints: readonly CorporateLlmCatalogEndpoint[]
): void {
  registeredEndpoints = endpoints.map((endpoint) => ({
    id: endpoint.id,
    label: endpoint.label,
    ...(endpoint.description ? { description: endpoint.description } : {})
  }))
  decorated = new WeakMap()
}

export function clearCorporateLlmEndpointsForTests(): void {
  registerCorporateLlmEndpoints([])
}

/**
 * How a corporate model id is launched — for ANY such id, including one the policy
 * no longer provisions. A stale id must still resolve here: main then reports an
 * unknown endpoint and leaves the environment alone, whereas falling through to the
 * catalog's model flag would hand the agent CLI a model name that does not exist.
 */
export function corporateLlmModelApply(modelId: string): CatalogOptionApply | null {
  const endpointId = corporateLlmEndpointIdFromModelId(modelId)
  if (!endpointId) {
    return null
  }
  return {
    // No --model flag: the endpoint serves its own model, and main derives the
    // base URL, the model name, and the token from this id at spawn time.
    launchEnv: () => ({ [CORPORATE_LLM_ENDPOINT_ENV]: endpointId }),
    // A backend is chosen when the process is spawned, so there is no mid-session
    // command to send; recording the pick is what makes the next launch use it.
    midSession: { kind: 'next-launch' }
  }
}

function corporateLlmModel(endpoint: CorporateLlmCatalogEndpoint): CatalogModel {
  const id = corporateLlmModelId(endpoint.id)
  const apply = corporateLlmModelApply(id)
  return {
    id,
    label: endpoint.label,
    ...(endpoint.description ? { description: endpoint.description } : {}),
    options: [],
    ...(apply ? { apply } : {})
  }
}

/**
 * Append the provisioned endpoints to an agent's models. Returns `catalog`
 * unchanged when no endpoint is provisioned, so a non-corporate install and every
 * existing test see the untouched upstream catalog.
 */
export function withCorporateLlmEndpointModels(
  catalog: AgentSessionOptionCatalog | null
): AgentSessionOptionCatalog | null {
  if (!catalog || registeredEndpoints.length === 0) {
    return catalog
  }
  const cached = decorated.get(catalog)
  if (cached) {
    return cached
  }
  // Why: identity is stable per registration because callers memoize on the
  // catalog object (surface creation, useMemo) and would otherwise rebuild forever.
  const next: AgentSessionOptionCatalog = {
    ...catalog,
    models: [...catalog.models, ...registeredEndpoints.map(corporateLlmModel)]
  }
  decorated.set(catalog, next)
  return next
}

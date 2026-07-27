// The full set of self-hosted endpoints a session may use: the ones an administrator
// provisions in the policy file, plus the ones this user added from Settings. Every
// consumer (the IPC list, token validation, and spawn-time selection) resolves through
// here so admin and user endpoints behave identically.

import type { EnterpriseLlmEndpoint } from '../../shared/enterprise-llm-endpoints'
import { getEnterprisePolicy } from './enterprise-policy-file'
import { readUserCorporateLlmEndpoints } from './corporate-llm-user-endpoints'

/** Policy endpoints first; a user endpoint never shadows a policy id (ids are distinct). */
export function getAllCorporateLlmEndpoints(): EnterpriseLlmEndpoint[] {
  const policyEndpoints = getEnterprisePolicy().llmEndpoints
  const policyIds = new Set(policyEndpoints.map((endpoint) => endpoint.id))
  const userEndpoints = readUserCorporateLlmEndpoints().filter(
    (endpoint) => !policyIds.has(endpoint.id)
  )
  return [...policyEndpoints, ...userEndpoints]
}

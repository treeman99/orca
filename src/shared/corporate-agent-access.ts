// Applies the enterprise policy's `allowedAgents` restriction to any agent-keyed
// list the UI shows (the agent catalog, account sections, the status-bar roster).
//
// A `null` allowlist means "no restriction" — the upstream behavior — so a build
// with no corporate policy behaves exactly as before. A non-null list confines the
// selectable agents to those ids; the company self-hosted models are not agents
// (they ride the allowed agent's model picker) so they never need listing here.

/** True when `agentId` may be shown/selected under the given allowlist. */
export function isAgentAllowedByPolicy(
  agentId: string,
  allowedAgents: readonly string[] | null | undefined
): boolean {
  return allowedAgents == null || allowedAgents.includes(agentId)
}

/** Keep only the entries whose derived agent id is permitted by the allowlist. */
export function filterAgentsByPolicy<T>(
  items: readonly T[],
  agentIdOf: (item: T) => string,
  allowedAgents: readonly string[] | null | undefined
): T[] {
  if (allowedAgents == null) {
    return [...items]
  }
  return items.filter((item) => allowedAgents.includes(agentIdOf(item)))
}

/**
 * True when `modelId` may be offered under the policy's `allowedModels`.
 *
 * Prefix match, not equality: the same model appears under several spellings depending on which
 * surface named it — a CLI alias (`opus`), the picker's version-qualified value (`opus[1m]`),
 * and the resolved API id (`claude-opus-5`). A fleet should express the family once, so an
 * entry matches an id that starts with it. `null` means no restriction.
 */
export function isModelAllowedByPolicy(
  modelId: string,
  allowedModels: readonly string[] | null | undefined
): boolean {
  if (allowedModels == null) {
    return true
  }
  const id = modelId.trim().toLowerCase()
  return allowedModels.some((allowed) => {
    const prefix = allowed.trim().toLowerCase()
    return prefix.length > 0 && id.startsWith(prefix)
  })
}

/** Keep only the models the policy permits. An allowlist that matches nothing is ignored
 *  rather than obeyed: an empty picker is a broken app, and the admin gets a warning path. */
export function filterModelsByPolicy<T>(
  models: readonly T[],
  modelIdOf: (model: T) => string,
  allowedModels: readonly string[] | null | undefined
): T[] {
  if (allowedModels == null) {
    return [...models]
  }
  const kept = models.filter((model) => isModelAllowedByPolicy(modelIdOf(model), allowedModels))
  return kept.length > 0 ? kept : [...models]
}

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

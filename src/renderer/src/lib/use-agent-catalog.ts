// The reactive form of getAgentCatalog(): the same corporate allowlist, but re-read when
// the policy lands instead of once at call time.
//
// Why it is a separate export and not just getAgentCatalog(): that one reads a module
// cache, so a component memo keyed on detection alone keeps the pre-policy list forever
// on the hosts that only have the async IPC channel (paired runtimes, the web client).
// Every picker that hand-rolled `filterAgentsByPolicy(getFullAgentCatalog(), …)` to work
// around that was one more place a later screen could forget — this is the one place.

import { useMemo } from 'react'
import { filterAgentsByPolicy } from '../../../shared/corporate-agent-access'
import { useEnterprisePolicyView } from '../enterprise/enterprise-policy-access'
import { getFullAgentCatalog, type AgentCatalogEntry } from './agent-catalog'

/** The agents a user may choose, narrowed by policy and refreshed when the policy arrives. */
export function useAgentCatalog(): AgentCatalogEntry[] {
  const { allowedAgents } = useEnterprisePolicyView()
  return useMemo(
    () => filterAgentsByPolicy(getFullAgentCatalog(), (entry) => entry.id, allowedAgents),
    [allowedAgents]
  )
}

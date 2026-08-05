// The corporate allowlist applied to the source-control text-generation roster.
//
// Why a hook and not a filter at each caller: this roster is a second agent list, parallel
// to the tab catalog, and its consumers (the generation dialog, the feature-wall settings
// row) each reached for the raw module constant — so a fleet that hides Codex still offered
// it as a commit-message writer. Settings → Source control already intersects its own list
// with getAgentCatalog(); this is the same gate for the surfaces that do not.

import { useMemo } from 'react'
import { filterAgentsByPolicy } from '../../../shared/corporate-agent-access'
import {
  listCommitMessageAgentCapabilities,
  type CommitMessageAgentCapability
} from '../../../shared/commit-message-agent-spec'
import { useEnterprisePolicyView } from '../enterprise/enterprise-policy-access'

/** Text-generation agents a user may choose, narrowed by policy and reactive to its arrival. */
export function useCommitMessageAgentCapabilities(): CommitMessageAgentCapability[] {
  const { allowedAgents } = useEnterprisePolicyView()
  return useMemo(
    () =>
      filterAgentsByPolicy(
        listCommitMessageAgentCapabilities(),
        (capability) => capability.id,
        allowedAgents
      ),
    [allowedAgents]
  )
}

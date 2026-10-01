// Fork-owned: the allowedAgents gate for managed worktree creation, lifted out of
// orca-runtime-create-managed-worktree.ts so it survives upstream filling that file to its cap.
import { assertAgentAllowedByEnterprisePolicy } from '../enterprise/agent-allowlist-guard'
import type { RuntimeManagedWorktreeCreateArgs } from './runtime-managed-worktree-create-types'

type GatedArgs = Pick<
  RuntimeManagedWorktreeCreateArgs,
  'startup' | 'startupAgent' | 'createdWithAgent' | 'startupDraftPaste'
>

/**
 * Why before the repo is even resolved: `args.startup` carries a pre-built launch command, so
 * this is the last look at the agent id on the `orca worktree create --agent` path — and
 * refusing here creates no worktree to clean up.
 */
export function assertManagedWorktreeAgentsAllowed(args: GatedArgs): void {
  const gatedAgent = args.startupAgent ?? args.createdWithAgent
  if ((args.startup || args.startupAgent) && gatedAgent) {
    assertAgentAllowedByEnterprisePolicy(gatedAgent)
  }
  if (args.startup && args.startupDraftPaste) {
    assertAgentAllowedByEnterprisePolicy(args.startupDraftPaste.agent)
  }
}

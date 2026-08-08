import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { useAppStore } from '@/store'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { DashboardSpawnAgentArgs } from '../../../../shared/dashboard-snapshot'
import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import { isAgentAllowedByPolicy } from '../../../../shared/corporate-agent-access'
import { getPolicyAllowedAgents } from '@/enterprise/enterprise-policy-access'

/** Starts the requested agent through the same host-aware tab path as Quick Launch. */
export function launchDashboardAgent({ worktreeId, agent }: DashboardSpawnAgentArgs): boolean {
  const state = useAppStore.getState()
  const executionHostId = getExecutionHostIdForWorktree(state, worktreeId)
  const worktree = state.getKnownWorktreeById(worktreeId, executionHostId)
  // Why here too: the popout renderer sends this over IPC with an agent id of its own
  // choosing, so filtering only the menu would leave a stale snapshot spawnable.
  if (
    !worktree ||
    !isTuiAgentEnabled(agent, state.settings?.disabledTuiAgents) ||
    !isAgentAllowedByPolicy(agent, getPolicyAllowedAgents())
  ) {
    return false
  }
  state.setActiveWorktree(worktreeId, executionHostId)
  return (
    launchAgentInNewTab({
      agent,
      worktreeId,
      launchSource: 'unknown'
    }) !== null
  )
}

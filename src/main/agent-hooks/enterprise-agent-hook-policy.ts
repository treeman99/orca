// Applies the corporate `allowedAgents` policy to the managed agent-hook lifecycle: sweep what
// an earlier build already installed, then hand the install chokepoint the blocked list.
//
// Why a wrapper instead of gating inside managed-agent-hook-controls: that module is compiled
// into the `orca` CLI (config/tsconfig.cli.json lists it), a deliberately electron-free slice of
// main, while the policy reader imports electron. So main's three entry points call this and the
// CLI keeps calling the ungated function. The residual surface is exactly one path: running
// `orca agent hooks enable` while the desktop app is down installs hooks the policy forbids —
// the offline branch in src/cli/handlers/agent-hooks.ts, reached only when no runtime answers.
// The sweep below removes them on the next app launch, so it self-heals.

import { AGENT_HOOK_TARGETS, type AgentHookInstallStatus } from '../../shared/agent-hook-types'
import { isAgentAllowedByEnterprisePolicy } from '../enterprise/agent-allowlist-guard'
import { sweepEnterpriseBlockedAgentHooks } from './enterprise-agent-hook-sweep'
import {
  applyAgentStatusHooksEnabled,
  type InstallOptions,
  type ManagedHookSettings
} from './managed-agent-hook-controls'

export async function applyAgentStatusHooksEnabledUnderEnterprisePolicy(
  enabled: boolean,
  settings: ManagedHookSettings = null,
  options: InstallOptions = {}
): Promise<AgentHookInstallStatus[]> {
  sweepEnterpriseBlockedAgentHooks()
  const blockedAgents = AGENT_HOOK_TARGETS.filter(
    (agent) => !isAgentAllowedByEnterprisePolicy(agent)
  )
  return applyAgentStatusHooksEnabled(enabled, settings, { ...options, blockedAgents })
}

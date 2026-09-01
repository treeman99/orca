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

import {
  AGENT_HOOK_TARGETS,
  type AgentHookInstallStatus,
  type AgentHookTarget
} from '../../shared/agent-hook-types'
import { isAgentAllowedByEnterprisePolicy } from '../enterprise/agent-allowlist-guard'
import { sweepEnterpriseBlockedAgentHooks } from './enterprise-agent-hook-sweep'
import {
  applyAgentStatusHooksEnabled,
  installManagedAgentHooks,
  type InstallOptions,
  type ManagedHookSettings
} from './managed-agent-hook-controls'

function enterpriseBlockedAgentHookTargets(): AgentHookTarget[] {
  return AGENT_HOOK_TARGETS.filter((agent) => !isAgentAllowedByEnterprisePolicy(agent))
}

export async function applyAgentStatusHooksEnabledUnderEnterprisePolicy(
  enabled: boolean,
  settings: ManagedHookSettings = null,
  options: InstallOptions = {}
): Promise<AgentHookInstallStatus[]> {
  sweepEnterpriseBlockedAgentHooks()
  return applyAgentStatusHooksEnabled(enabled, settings, {
    ...options,
    blockedAgents: enterpriseBlockedAgentHookTargets()
  })
}

// Startup takes this install-only path (never remove — the hook files are user-global, STA-5679),
// so it needs the same sweep + blocked list as the toggle path above.
export async function installManagedAgentHooksUnderEnterprisePolicy(
  settings: ManagedHookSettings = null,
  options: InstallOptions = {}
): Promise<AgentHookInstallStatus[]> {
  sweepEnterpriseBlockedAgentHooks()
  return installManagedAgentHooks(settings, {
    ...options,
    blockedAgents: enterpriseBlockedAgentHookTargets()
  })
}

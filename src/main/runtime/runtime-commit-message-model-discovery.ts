/**
 * Model discovery for the source-control AI row, split out of
 * `runtime-git-generation-commands.ts` to keep that file inside the `max-lines` budget.
 */
import type { TuiAgent } from '../../shared/tui-agent'
import { agentBlockedByPolicyResult } from '../enterprise/agent-allowlist-guard'
import { prepareLocalCommitMessageAgentEnv } from '../text-generation/commit-message-agent-environment'
import {
  discoverCommitMessageModelsLocal,
  discoverCommitMessageModelsRemote,
  type DiscoverCommitMessageModelsResult
} from '../text-generation/commit-message-text-generation'
import {
  localGitOptionsForTarget,
  runtimeGitRouteForTarget,
  type RuntimeGitCommandHost
} from './runtime-git-command-target'
import {
  localAgentRuntimeTargetForTarget,
  type RuntimeCommitMessageSettingsOverride
} from './runtime-git-generation-context'

export async function discoverRuntimeCommitMessageModelsForHost(
  host: RuntimeGitCommandHost,
  worktreeSelector: string,
  agentId: string,
  settingsOverride?: Pick<RuntimeCommitMessageSettingsOverride, 'agentCmdOverrides'>
): Promise<DiscoverCommitMessageModelsResult> {
  // Why here too: discovery runs the agent binary to list its models, so a blocked CLI
  // would still be executed just by opening the source-control AI settings row.
  const agentBlocked = agentBlockedByPolicyResult(agentId)
  if (agentBlocked) {
    return agentBlocked
  }
  const target = await host.resolveRuntimeGitTarget(worktreeSelector)
  const typedAgentId = agentId as TuiAgent
  const agentCommandOverride =
    settingsOverride?.agentCmdOverrides?.[typedAgentId] ??
    host.getRuntimeSettings().agentCmdOverrides?.[typedAgentId]
  const route = runtimeGitRouteForTarget(target)
  if (route.kind === 'ssh') {
    const provider = route.provider
    if (!provider) {
      return { success: false, error: `No git provider for connection "${route.connectionId}"` }
    }
    return discoverCommitMessageModelsRemote(
      typedAgentId,
      target.worktree.path,
      (plan, cwd, timeoutMs) => provider.executeCommitMessagePlan(plan, cwd, timeoutMs),
      agentCommandOverride
    )
  }
  const localEnv = await prepareLocalCommitMessageAgentEnv(
    typedAgentId,
    host.getCommitMessageAgentEnvironment?.(),
    localAgentRuntimeTargetForTarget(target)
  )
  if (!localEnv.ok) {
    return { success: false, error: localEnv.error }
  }
  const localOptions = localGitOptionsForTarget(target)
  return localOptions.wslDistro
    ? discoverCommitMessageModelsLocal(typedAgentId, localEnv.env, agentCommandOverride, {
        cwd: target.worktree.path,
        wslDistro: localOptions.wslDistro
      })
    : discoverCommitMessageModelsLocal(typedAgentId, localEnv.env, agentCommandOverride)
}

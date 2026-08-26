// Undoes managed agent hooks for the CLIs the corporate `allowedAgents` policy forbids.
//
// The install gate in managed-agent-hook-controls only stops *new* writes. A machine that ran
// an older build still has those agents' managed entries in their own config files and their
// launchers sitting in ~/.orca/agent-hooks, for agents the policy will never let spawn. An
// unrestricted policy (`allowedAgents: null` — every upstream and dev build) is a hard no-op.

import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { AGENT_HOOK_TARGETS, type AgentHookTarget } from '../../shared/agent-hook-types'
import { resolveOrcaManagedCodexHomePath } from '../codex/codex-home-paths'
import { isAgentAllowedByEnterprisePolicy } from '../enterprise/agent-allowlist-guard'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'
import { getSharedManagedScriptDir, getSharedManagedScriptPath } from './installer-utils'
import {
  MANAGED_AGENT_HOOK_REMOVERS,
  MANAGED_AGENT_HOOK_STATUS_READERS
} from './managed-agent-hook-registry'

const MANAGED_LAUNCHER_EXTENSIONS = ['.sh', '.cmd', '.ps1'] as const

function readManagedScriptDirFileNames(): string[] {
  try {
    return readdirSync(getSharedManagedScriptDir(), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

// Why the prefix scan on top of the conventional names: some agents write more than one
// launcher (Antigravity's per-event .cmd wrappers, Claude/OpenClaude's statusline script),
// and the point of the sweep is that the folder stops listing a blocked agent at all.
function launcherFileNames(agent: AgentHookTarget, dirFileNames: readonly string[]): string[] {
  const prefix = `${agent}-`
  return [
    ...new Set([
      ...MANAGED_LAUNCHER_EXTENSIONS.map((extension) => `${agent}-hook${extension}`),
      ...dirFileNames.filter((name) => name.startsWith(prefix))
    ])
  ]
}

const REMOVERS_BY_AGENT = new Map(MANAGED_AGENT_HOOK_REMOVERS)

const STATUS_READERS_BY_AGENT = new Map(MANAGED_AGENT_HOOK_STATUS_READERS)

// Why only codex: of the 14 status readers it is the one that writes. It resolves its runtime
// home through getOrcaManagedCodexHomePath(), which mkdirs the managed-home mirror — and the
// trust-grant ledger it reads does so too, ignoring any home passed in. Probing the hooks.json
// that reader would read gives the same answer without creating anything; once that file exists
// the mirror does too, so the reader's mkdir is then a no-op.
const PRESENCE_PRECHECKS: Partial<Record<AgentHookTarget, () => boolean>> = {
  codex: () => existsSync(join(resolveOrcaManagedCodexHomePath(), 'hooks.json'))
}

// Why: remove() ends in writeHooksJson(), which mkdirs and CREATES the vendor config when it is
// absent — readHooksJson answers `{}` for a missing file, so "never installed" looks like
// "installed nothing". Ungated, a sweep meant to clean ~/.gemini instead conjures ~/.gemini,
// ~/.cursor, ~/.factory … on machines where those CLIs were never installed.
function hasManagedHooksInstalled(agent: AgentHookTarget): boolean {
  const getStatus = STATUS_READERS_BY_AGENT.get(agent)
  if (!getStatus || PRESENCE_PRECHECKS[agent]?.() === false) {
    return false
  }
  try {
    return getStatus().managedHooksPresent
  } catch (error) {
    console.warn(`[agent-hooks] Policy sweep could not read the ${agent} hook status:`, error)
    return false
  }
}

function clearAgentConfigEntries(agent: AgentHookTarget): void {
  const remove = REMOVERS_BY_AGENT.get(agent)
  if (!remove || !hasManagedHooksInstalled(agent)) {
    return
  }
  try {
    remove()
  } catch (error) {
    // Why: one unparseable agent config must not strand the rest of the sweep.
    console.warn(`[agent-hooks] Policy sweep could not clear the ${agent} config:`, error)
  }
}

function deleteAgentLaunchers(agent: AgentHookTarget, dirFileNames: readonly string[]): void {
  for (const fileName of launcherFileNames(agent, dirFileNames)) {
    try {
      // `force` swallows ENOENT, which is what makes a second sweep a no-op.
      rmSync(getSharedManagedScriptPath(fileName), { force: true })
    } catch (error) {
      console.warn(`[agent-hooks] Policy sweep could not delete ${fileName}:`, error)
    }
  }
}

/** Removes managed hooks for every `AGENT_HOOK_TARGETS` entry the policy does not allow. */
export function sweepEnterpriseBlockedAgentHooks(): void {
  if (getEnterprisePolicy().allowedAgents == null) {
    return
  }
  const blocked = AGENT_HOOK_TARGETS.filter((agent) => !isAgentAllowedByEnterprisePolicy(agent))
  if (blocked.length === 0) {
    return
  }
  const dirFileNames = readManagedScriptDirFileNames()
  for (const agent of blocked) {
    // Why this order: deleting the launcher first would leave the agent's config invoking a
    // script that no longer exists, erroring on every hook event until the config is cleared.
    clearAgentConfigEntries(agent)
    deleteAgentLaunchers(agent, dirFileNames)
  }
}

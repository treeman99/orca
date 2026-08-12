import { join } from 'node:path'
import { SKILLS_CLI_UNIVERSAL_AGENT_KEY } from './skills-cli-agent-keys'

/**
 * The global skill directories an offline install may write, keyed by the same
 * discovery root ids the freshness inventory scans.
 *
 * Kept in lockstep with `buildSkillDiscoverySources` by a parity test rather than by
 * importing it: discovery is main-only and also enumerates repo and plugin-cache roots,
 * which an install must never touch.
 */
export type AgentSkillInstallRoot = {
  /** Matches the `SkillScanRoot.id` the freshness inventory reports for this directory. */
  rootId: string
  /** Home-relative path segments, joined by the caller's path flavour. */
  segments: readonly string[]
  /** `skills --agent` key that selects this root, or null when the CLI has no key for it. */
  agentKey: string | null
}

export const AGENT_SKILL_INSTALL_ROOTS: readonly AgentSkillInstallRoot[] = [
  { rootId: 'home-codex', segments: ['.codex', 'skills'], agentKey: 'codex' },
  {
    rootId: 'home-agents',
    segments: ['.agents', 'skills'],
    agentKey: SKILLS_CLI_UNIVERSAL_AGENT_KEY
  },
  { rootId: 'home-claude', segments: ['.claude', 'skills'], agentKey: 'claude-code' },
  { rootId: 'home-grok', segments: ['.grok', 'skills'], agentKey: 'grok' },
  { rootId: 'home-opencode', segments: ['.config', 'opencode', 'skills'], agentKey: 'opencode' },
  { rootId: 'home-pi', segments: ['.pi', 'agent', 'skills'], agentKey: 'pi' },
  // Why: Orca detects OMP but the skills CLI has no key for it, so it is reachable
  // only as an already-present install, never as an explicit --agent target.
  { rootId: 'home-omp', segments: ['.omp', 'agent', 'skills'], agentKey: null },
  { rootId: 'home-gemini', segments: ['.gemini', 'skills'], agentKey: 'gemini-cli' },
  {
    rootId: 'home-antigravity',
    segments: ['.gemini', 'antigravity', 'skills'],
    agentKey: 'antigravity'
  },
  { rootId: 'home-cursor', segments: ['.cursor', 'skills'], agentKey: 'cursor' }
]

export function agentSkillInstallRootPath(homeDir: string, root: AgentSkillInstallRoot): string {
  return join(homeDir, ...root.segments)
}

/** Roots the given `skills --agent` keys select. Unknown keys resolve to nothing. */
export function resolveAgentSkillInstallRoots(
  agentKeys: readonly string[]
): AgentSkillInstallRoot[] {
  const requested = new Set(agentKeys)
  return AGENT_SKILL_INSTALL_ROOTS.filter(
    (root) => root.agentKey !== null && requested.has(root.agentKey)
  )
}

export function knownAgentSkillInstallAgentKeys(): string[] {
  return AGENT_SKILL_INSTALL_ROOTS.flatMap((root) => (root.agentKey ? [root.agentKey] : [])).sort(
    (left, right) => left.localeCompare(right, 'en')
  )
}

import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { RuntimeClientError } from '../runtime-client'
import {
  AGENT_SKILL_INSTALL_ROOTS,
  agentSkillInstallRootPath,
  resolveAgentSkillInstallRoots,
  type AgentSkillInstallRoot
} from '../../shared/agent-skill-install-roots'
import { installBundledSkills } from '../../shared/bundled-skill-install'
import { resolveBundledSkillPackageRoot } from '../../shared/bundled-skill-package-source'

/** Project-scoped targets for `--local`, mirroring the repo roots skill discovery scans. */
const PROJECT_SKILL_INSTALL_ROOTS: readonly AgentSkillInstallRoot[] = [
  { rootId: 'repo-agents', segments: ['.agents', 'skills'], agentKey: null },
  { rootId: 'repo-claude', segments: ['.claude', 'skills'], agentKey: null }
]

async function directoryExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * The bundled package directory for this build.
 *
 * Packaged builds carry it beside the freshness manifest under `process.resourcesPath`;
 * a dev checkout runs straight off the repository's `skills/` tree.
 */
export async function resolveInstallablePackageRoot(): Promise<string> {
  const candidates = resolveBundledSkillPackageRoot({
    // Electron sets this even under ELECTRON_RUN_AS_NODE, which is how the CLI runs.
    resourcesPath: (process as { resourcesPath?: string }).resourcesPath ?? null,
    // out/cli/handlers -> out/cli -> out -> repo root
    repoRoot: resolve(__dirname, '..', '..', '..')
  })
  for (const candidate of candidates) {
    if (await directoryExists(candidate)) {
      return candidate
    }
  }
  throw new RuntimeClientError(
    'invalid_environment',
    'This Orca build does not carry bundled skill packages, so there is nothing to ' +
      'install offline. Reinstall Orca from a build that includes them.'
  )
}

/** Global roots that already hold this skill — the only ones an update may refresh. */
async function placedGlobalRoots(
  homeDir: string,
  names: readonly string[]
): Promise<AgentSkillInstallRoot[]> {
  const placed: AgentSkillInstallRoot[] = []
  for (const root of AGENT_SKILL_INSTALL_ROOTS) {
    const rootPath = agentSkillInstallRootPath(homeDir, root)
    for (const name of names) {
      if (await directoryExists(join(rootPath, name))) {
        placed.push(root)
        break
      }
    }
  }
  return placed
}

export type OfflineSkillMutation = {
  verb: 'install' | 'update'
  skillNames: string[]
  global: boolean
  /** `skills --agent` keys chosen for an install; ignored by update. */
  agentKeys: string[]
}

export type OfflineSkillMutationReport = {
  lines: string[]
  failedNames: string[]
}

/**
 * Copy bundled skill packages into place with no npm registry or GitHub access.
 *
 * Replaces the community `npx skills add/update` lane: the bytes ship inside this
 * binary, which is the only way the command can complete on a network that reaches
 * neither registry.npmjs.org nor github.com.
 */
export async function runOfflineSkillMutation(
  mutation: OfflineSkillMutation,
  options: { homeDir?: string; cwd?: string } = {}
): Promise<OfflineSkillMutationReport> {
  const homeDir = options.homeDir ?? homedir()
  const cwd = options.cwd ?? process.cwd()
  const packageRoot = await resolveInstallablePackageRoot()

  const roots = !mutation.global
    ? PROJECT_SKILL_INSTALL_ROOTS
    : mutation.verb === 'update'
      ? await placedGlobalRoots(homeDir, mutation.skillNames)
      : resolveAgentSkillInstallRoots(mutation.agentKeys)

  if (roots.length === 0) {
    throw new RuntimeClientError(
      'invalid_environment',
      mutation.verb === 'update'
        ? 'None of the requested skills are installed in a global agent directory, so ' +
            'there is nothing to update. Run `orca skills install` first.'
        : 'No install target matched the requested agents.'
    )
  }

  const result = await installBundledSkills({
    names: mutation.skillNames,
    packageRoot,
    homeDir: mutation.global ? homeDir : cwd,
    roots,
    stateHome: mutation.global ? (process.env.XDG_STATE_HOME ?? null) : null,
    recordLock: mutation.global
  })

  const lines = [
    ...result.installed.map(
      (outcome) => `${outcome.name}: wrote ${outcome.installedPaths.length} location(s)`
    ),
    ...result.installed.flatMap((outcome) => outcome.installedPaths.map((path) => `  ${path}`)),
    ...result.errors.map((failure) => `${failure.name}: ${failure.message}`)
  ]
  return { lines, failedNames: result.errors.map((failure) => failure.name) }
}

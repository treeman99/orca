// Reconciles the skills this build ships into the agent skill homes on the machine, so a
// corporate install does not depend on anyone running `orca skills install` by hand.
//
// Why this exists at all: the fork bundles engineering-discipline skills the orchestration
// guide routes into worker specs by name. A worker that is told to apply
// `verification-before-completion` and does not have it reports the spec as unfollowable —
// so shipping the bytes is only half the job, placing them is the other half.
//
// Why it never blindly overwrites: these directories are the user's, and a hand-edited skill
// is a deliberate act. A placed copy is refreshed only when the updater lock proves this
// build's installer wrote it and nobody has touched it since. Anything else is left alone.

import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  AGENT_SKILL_INSTALL_ROOTS,
  agentSkillInstallRootPath,
  type AgentSkillInstallRoot
} from '../../shared/agent-skill-install-roots'
import {
  BUNDLED_SKILL_LOCK_SOURCE,
  globalSkillLockPath,
  installBundledSkills
} from '../../shared/bundled-skill-install'
import { readBundledSkillPackage } from '../../shared/bundled-skill-package-source'
import {
  gitBlobSha,
  skillPackageGitTreeSha,
  type SkillGitTreeFileEntry
} from '../../shared/skill-git-tree-identity'

/** Always a target: the shared root every agent Orca supports reads. */
const SHARED_ROOT_ID = 'home-agents'

export type BundledSkillAutoInstallDecision =
  | 'installed'
  | 'already-current'
  | 'kept-user-copy'
  | 'failed'

export type BundledSkillAutoInstallResult = {
  decisions: { name: string; root: string; decision: BundledSkillAutoInstallDecision }[]
  errors: { name: string; message: string }[]
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}

/**
 * The shared root plus every agent home that already exists.
 *
 * The parent is the probe, not the `skills` directory itself: `~/.claude` exists as soon as
 * Claude Code has run once, while `~/.claude/skills` appears only after a first skill lands.
 * Probing the latter would mean an agent never receives its first bundled skill.
 */
export async function resolveAutoInstallRoots(
  homeDir: string,
  exists: (path: string) => Promise<boolean> = pathExists
): Promise<AgentSkillInstallRoot[]> {
  const roots: AgentSkillInstallRoot[] = []
  for (const root of AGENT_SKILL_INSTALL_ROOTS) {
    if (root.rootId === SHARED_ROOT_ID) {
      roots.push(root)
      continue
    }
    if (await exists(dirname(agentSkillInstallRootPath(homeDir, root)))) {
      roots.push(root)
    }
  }
  return roots
}

async function walkFiles(root: string, relative = ''): Promise<string[]> {
  const absolute = relative ? join(root, relative) : root
  const entries = await readdir(absolute, { withFileTypes: true }).catch(() => null)
  if (!entries) {
    return []
  }
  const found: string[] = []
  for (const entry of entries) {
    const next = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      found.push(...(await walkFiles(root, next)))
    } else if (entry.isFile()) {
      found.push(next)
    }
  }
  return found
}

/** Git tree sha of a placed skill folder, or null when nothing is placed there. */
export async function readPlacedTreeSha(directory: string): Promise<string | null> {
  const paths = await walkFiles(directory)
  if (paths.length === 0) {
    return null
  }
  const entries: SkillGitTreeFileEntry[] = []
  for (const path of paths.sort()) {
    const bytes = await readFile(join(directory, path)).catch(() => null)
    if (!bytes) {
      return null
    }
    // Executability is not reconciled: the bundle refuses to ship executable files, so every
    // placed byte this installer wrote is mode 644 and hashing it as such matches the manifest.
    entries.push({ path, executable: false, blobSha: gitBlobSha(bytes) })
  }
  return skillPackageGitTreeSha(entries)
}

async function readLockHashes(lockPath: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>()
  const raw = await readFile(lockPath, 'utf8').catch(() => null)
  if (!raw) {
    return hashes
  }
  let document: unknown
  try {
    document = JSON.parse(raw)
  } catch {
    return hashes
  }
  const skills = (document as { skills?: Record<string, unknown> }).skills
  if (!skills || typeof skills !== 'object') {
    return hashes
  }
  for (const [name, entry] of Object.entries(skills)) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const record = entry as { source?: unknown; skillFolderHash?: unknown }
    // Only a copy this build's installer placed may be refreshed. An `npx skills add`
    // install or a hand-made folder is someone else's, whatever its bytes look like.
    if (record.source === BUNDLED_SKILL_LOCK_SOURCE && typeof record.skillFolderHash === 'string') {
      hashes.set(name, record.skillFolderHash)
    }
  }
  return hashes
}

/**
 * Decide what to do with one placed copy.
 *
 * `kept-user-copy` covers both a hand-edited skill and one another tool installed: in either
 * case the bytes on disk are not ours to replace, and a stale bundled skill is a far smaller
 * problem than silently discarding someone's edit.
 */
export function decidePlacement(args: {
  placedSha: string | null
  bundledSha: string
  lockSha: string | undefined
}): Exclude<BundledSkillAutoInstallDecision, 'failed'> {
  if (args.placedSha === null) {
    return 'installed'
  }
  if (args.placedSha === args.bundledSha) {
    return 'already-current'
  }
  return args.lockSha !== undefined && args.placedSha === args.lockSha
    ? 'installed'
    : 'kept-user-copy'
}

/**
 * Place every bundled skill that is missing or stale-but-ours, in every agent home present.
 *
 * Runs on its own at startup, so it reports rather than throws: a machine where one agent
 * home is unwritable must still get the skill everywhere else.
 */
export async function autoInstallBundledSkills(args: {
  names: readonly string[]
  packageRoot: string
  homeDir: string
  stateHome?: string | null
  roots?: readonly AgentSkillInstallRoot[]
}): Promise<BundledSkillAutoInstallResult> {
  const result: BundledSkillAutoInstallResult = { decisions: [], errors: [] }
  const roots = args.roots ?? (await resolveAutoInstallRoots(args.homeDir))
  if (roots.length === 0) {
    return result
  }
  const lockHashes = await readLockHashes(
    globalSkillLockPath({ homeDir: args.homeDir, stateHome: args.stateHome ?? null })
  )

  for (const name of args.names) {
    let bundledSha: string
    try {
      const files = await readBundledSkillPackage(args.packageRoot, name)
      bundledSha = skillPackageGitTreeSha(
        files.map((file) => ({
          path: file.path,
          executable: file.executable,
          blobSha: gitBlobSha(file.bytes)
        }))
      )
    } catch (error) {
      result.errors.push({ name, message: error instanceof Error ? error.message : String(error) })
      continue
    }

    const targets: AgentSkillInstallRoot[] = []
    for (const root of roots) {
      const decision = decidePlacement({
        placedSha: await readPlacedTreeSha(
          join(agentSkillInstallRootPath(args.homeDir, root), name)
        ),
        bundledSha,
        lockSha: lockHashes.get(name)
      })
      result.decisions.push({ name, root: root.rootId, decision })
      if (decision === 'installed') {
        targets.push(root)
      }
    }
    if (targets.length === 0) {
      continue
    }

    const outcome = await installBundledSkills({
      names: [name],
      packageRoot: args.packageRoot,
      homeDir: args.homeDir,
      roots: targets,
      stateHome: args.stateHome ?? null
    })
    for (const failure of outcome.errors) {
      result.errors.push(failure)
      for (const decision of result.decisions) {
        if (decision.name === failure.name && decision.decision === 'installed') {
          decision.decision = 'failed'
        }
      }
    }
  }
  return result
}

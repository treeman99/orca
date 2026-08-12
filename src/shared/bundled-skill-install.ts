import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { agentSkillInstallRootPath, type AgentSkillInstallRoot } from './agent-skill-install-roots'
import {
  readBundledSkillPackage,
  type BundledSkillPackageFile
} from './bundled-skill-package-source'
import { gitBlobSha, skillPackageGitTreeSha } from './skill-git-tree-identity'

/**
 * Version the updater lock must declare for Orca to treat its entries as
 * update-eligible. Mirrors `GLOBAL_SKILL_LOCK_SCHEMA_VERSION` in
 * `skill-update-registration.ts`, which reads what this writes.
 */
const GLOBAL_SKILL_LOCK_SCHEMA_VERSION = 3

/** Marks lock entries this build wrote, so a later read can tell them from the npm CLI's. */
export const BUNDLED_SKILL_LOCK_SOURCE = 'orca-bundled'

export type BundledSkillInstallOutcome = {
  name: string
  /** Directories that now hold the package, one per targeted agent home. */
  installedPaths: string[]
  gitTreeSha: string
}

export type BundledSkillInstallResult = {
  installed: BundledSkillInstallOutcome[]
  errors: { name: string; message: string }[]
}

export function globalSkillLockPath(args: { homeDir: string; stateHome?: string | null }): string {
  return args.stateHome
    ? join(args.stateHome, 'skills', '.skill-lock.json')
    : join(args.homeDir, '.agents', '.skill-lock.json')
}

async function writeFileAtomically(path: string, bytes: Buffer | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  // Why: agents read these files continuously; a torn SKILL.md is worse than an old one.
  const staging = `${path}.orca-tmp`
  await writeFile(staging, bytes)
  await rename(staging, path)
}

async function writePackageInto(
  targetDir: string,
  files: readonly BundledSkillPackageFile[]
): Promise<void> {
  await mkdir(targetDir, { recursive: true })
  for (const file of files) {
    await writeFileAtomically(join(targetDir, ...file.path.split('/')), file.bytes)
  }
}

function packageGitTreeSha(files: readonly BundledSkillPackageFile[]): string {
  return skillPackageGitTreeSha(
    files.map((file) => ({
      path: file.path,
      executable: file.executable,
      blobSha: gitBlobSha(file.bytes)
    }))
  )
}

type LockDocument = {
  version?: unknown
  skills?: Record<string, unknown>
  [key: string]: unknown
}

async function readLockDocument(lockPath: string): Promise<LockDocument> {
  try {
    const parsed = JSON.parse(await readFile(lockPath, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed as LockDocument
  } catch {
    // Why: an unreadable or malformed lock is replaced, not merged — the entries this
    // install writes are the only ones it can vouch for.
    return {}
  }
}

/**
 * Record the install so `skills update` eligibility sees it.
 *
 * Unrelated entries and unknown fields are preserved: a machine that also ran the
 * community CLI keeps its own records.
 */
async function recordInstallInLock(args: {
  lockPath: string
  entries: { name: string; skillPath: string; gitTreeSha: string }[]
}): Promise<void> {
  const document = await readLockDocument(args.lockPath)
  const existingSkills =
    document.skills && typeof document.skills === 'object' && !Array.isArray(document.skills)
      ? document.skills
      : {}
  const skills: Record<string, unknown> = { ...existingSkills }
  for (const entry of args.entries) {
    const previous = skills[entry.name]
    const preserved =
      previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}
    skills[entry.name] = {
      ...preserved,
      skillFolderHash: entry.gitTreeSha,
      skillPath: entry.skillPath,
      source: BUNDLED_SKILL_LOCK_SOURCE
    }
  }
  const version =
    typeof document.version === 'number' && document.version > GLOBAL_SKILL_LOCK_SCHEMA_VERSION
      ? document.version
      : GLOBAL_SKILL_LOCK_SCHEMA_VERSION
  await writeFileAtomically(
    args.lockPath,
    `${JSON.stringify({ ...document, version, skills }, null, 2)}\n`
  )
}

/**
 * Install bundled skill packages into the given agent homes without any network access.
 *
 * This replaces `npx skills add <repo>` for Orca's own skills: the bytes ship inside the
 * build, so a machine with no npm registry or GitHub reachability installs the same
 * content the freshness manifest was generated from.
 */
export async function installBundledSkills(args: {
  names: readonly string[]
  packageRoot: string
  /** Base the roots' segments hang off — the user's home for a global install. */
  homeDir: string
  roots: readonly AgentSkillInstallRoot[]
  stateHome?: string | null
  /** Off for project-scoped installs: the updater lock only describes global ones. */
  recordLock?: boolean
}): Promise<BundledSkillInstallResult> {
  const result: BundledSkillInstallResult = { installed: [], errors: [] }
  if (args.roots.length === 0) {
    return {
      installed: [],
      errors: args.names.map((name) => ({ name, message: 'No install target was selected.' }))
    }
  }

  const lockEntries: { name: string; skillPath: string; gitTreeSha: string }[] = []
  for (const name of args.names) {
    try {
      const files = await readBundledSkillPackage(args.packageRoot, name)
      const installedPaths: string[] = []
      for (const root of args.roots) {
        const targetDir = join(agentSkillInstallRootPath(args.homeDir, root), name)
        await writePackageInto(targetDir, files)
        installedPaths.push(targetDir)
      }
      const gitTreeSha = packageGitTreeSha(files)
      // Why: the lock names one canonical folder; prefer the shared `.agents` root every
      // agent reads so the recorded path outlives any single agent being uninstalled.
      const canonicalIndex = args.roots.findIndex((root) => root.rootId === 'home-agents')
      lockEntries.push({
        name,
        skillPath: installedPaths[Math.max(canonicalIndex, 0)],
        gitTreeSha
      })
      result.installed.push({ name, installedPaths, gitTreeSha })
    } catch (error) {
      result.errors.push({
        name,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  if (lockEntries.length > 0 && args.recordLock !== false) {
    await recordInstallInLock({
      lockPath: globalSkillLockPath({ homeDir: args.homeDir, stateHome: args.stateHome }),
      entries: lockEntries
    })
  }
  return result
}

// Replaces every skill of the corporate bundle, whole folders at a time, in each home.
//
// Each folder is written complete in a staging area on the same volume and then swapped in
// with a rename, so an agent reading the skill mid-update sees the old copy or the new one,
// never a mix — and a file the new revision dropped does not linger beside it.

import { dirname, join } from 'node:path'
import { chmod, lstat, mkdir, mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises'
import { corporateSkillBundleSource } from '../../shared/corporate-skill-bundle'
import { globalSkillLockPath, updateSkillLockEntries } from '../../shared/bundled-skill-install'
import { renameSkillPathWithWindowsRetry } from '../skills/skill-filesystem-retry'
import type { CorporateRemoteBundle, CorporateRemoteSkill } from './corporate-skill-bundle-remote'
import type { CorporateSkillBundleFiles } from './corporate-skill-bundle-download'
import type { CorporateSkillHomeRoot } from './corporate-skill-local-observation'

export type CorporateSkillInstallOutcome = {
  installedNames: string[]
  /** Placements left alone: links (their target may be someone else's) and non-folders. */
  skippedPaths: string[]
  errors: string[]
}

const STAGING_FOLDER = '.orca-skill-bundle-staging'

async function writeSkillFolder(
  directory: string,
  skill: CorporateRemoteSkill,
  files: ReadonlyMap<string, Buffer>
): Promise<void> {
  await mkdir(directory, { recursive: true })
  for (const file of skill.files) {
    const bytes = files.get(file.path)
    if (!bytes) {
      throw new Error(`skills/${skill.name}/${file.path} was not downloaded`)
    }
    const target = join(directory, ...file.path.split('/'))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
    if (file.executable && process.platform !== 'win32') {
      await chmod(target, 0o755)
    }
  }
}

/** What stands at `path` now: nothing, a real folder, or something Orca must not replace. */
async function placementKind(path: string): Promise<'absent' | 'folder' | 'foreign'> {
  try {
    const stats = await lstat(path)
    return stats.isDirectory() && !stats.isSymbolicLink() ? 'folder' : 'foreign'
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return 'absent'
    }
    throw error
  }
}

async function swapIn(staged: string, target: string): Promise<void> {
  const kind = await placementKind(target)
  if (kind === 'absent') {
    await renameSkillPathWithWindowsRetry(staged, target)
    return
  }
  const previous = `${staged}.previous`
  await renameSkillPathWithWindowsRetry(target, previous)
  try {
    await renameSkillPathWithWindowsRetry(staged, target)
  } catch (error) {
    // Put the old copy back rather than leave the skill missing.
    await renameSkillPathWithWindowsRetry(previous, target).catch(() => undefined)
    throw error
  }
  await rm(previous, { recursive: true, force: true }).catch(() => undefined)
}

async function installIntoHome(args: {
  root: CorporateSkillHomeRoot
  bundle: CorporateRemoteBundle
  files: CorporateSkillBundleFiles
  outcome: CorporateSkillInstallOutcome
  installed: Set<string>
}): Promise<void> {
  const { root, bundle, files, outcome, installed } = args
  await mkdir(root.path, { recursive: true })
  // Beside the skills folder, not inside it: agents scan every folder in there.
  const stagingParent = join(dirname(root.path), STAGING_FOLDER)
  await mkdir(stagingParent, { recursive: true })
  const runDirectory = await mkdtemp(join(stagingParent, 'run-'))
  try {
    for (const skill of bundle.skills) {
      const target = join(root.path, skill.name)
      try {
        if ((await placementKind(target)) === 'foreign') {
          outcome.skippedPaths.push(target)
          continue
        }
        const staged = join(runDirectory, skill.name)
        await writeSkillFolder(staged, skill, files.get(skill.name) ?? new Map())
        await swapIn(staged, target)
        installed.add(skill.name)
      } catch (error) {
        outcome.errors.push(`${target}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } finally {
    await rm(runDirectory, { recursive: true, force: true }).catch(() => undefined)
    await rmdir(stagingParent).catch(() => undefined)
  }
}

export async function installCorporateSkillBundle(args: {
  bundle: CorporateRemoteBundle
  files: CorporateSkillBundleFiles
  roots: readonly CorporateSkillHomeRoot[]
  homeDir: string
  stateHome?: string | null
  now?: () => Date
}): Promise<CorporateSkillInstallOutcome> {
  const outcome: CorporateSkillInstallOutcome = { installedNames: [], skippedPaths: [], errors: [] }
  const installed = new Set<string>()
  for (const root of args.roots) {
    try {
      await installIntoHome({ ...args, root, outcome, installed })
    } catch (error) {
      outcome.errors.push(`${root.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  outcome.installedNames = args.bundle.skills
    .map((skill) => skill.name)
    .filter((name) => installed.has(name))
  if (installed.size > 0) {
    await recordCorporateInstallInLock(args, outcome.installedNames)
  }
  return outcome
}

// Why: the lock's `source` is what tells the build's own freshness check that these copies
// are the corporate bundle's, not stale copies of the skills this build ships.
async function recordCorporateInstallInLock(
  args: {
    bundle: CorporateRemoteBundle
    homeDir: string
    stateHome?: string | null
    now?: () => Date
  },
  names: readonly string[]
): Promise<void> {
  const { bundle } = args
  const source = corporateSkillBundleSource(bundle.host, bundle.repository)
  const timestamp = (args.now?.() ?? new Date()).toISOString()
  const treeShaOf = new Map(bundle.skills.map((skill) => [skill.name, skill.treeSha]))
  await updateSkillLockEntries(
    globalSkillLockPath({ homeDir: args.homeDir, stateHome: args.stateHome }),
    names.map((name) => ({
      name,
      fields: (previous) => ({
        source,
        sourceType: 'git',
        sourceUrl: `${source}.git`,
        ref: bundle.commitSha,
        skillPath: `skills/${name}/SKILL.md`,
        skillFolderHash: treeShaOf.get(name),
        installedAt: typeof previous.installedAt === 'string' ? previous.installedAt : timestamp,
        updatedAt: timestamp
      })
    }))
  )
}

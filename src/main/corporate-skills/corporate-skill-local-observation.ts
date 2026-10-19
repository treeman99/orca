// Whether each installed copy of a bundle skill is the remote revision, file by file.
//
// Compared by git blob hash against the remote tree, not by a folder hash, so a Windows
// checkout with CRLF line endings or a lost executable bit still counts as the same files.

import { homedir } from 'node:os'
import { join } from 'node:path'
import { lstat, readdir, readFile } from 'node:fs/promises'
import type {
  CorporateSkillBundleSkill,
  CorporateSkillHome,
  CorporateSkillPlacementState
} from '../../shared/corporate-skill-bundle'
import { gitBlobSha } from '../../shared/skill-git-tree-identity'
import type { CorporateRemoteSkill } from './corporate-skill-bundle-remote'

export type CorporateSkillHomeRoot = { home: CorporateSkillHome; path: string }

const MAX_LOCAL_ENTRIES = 2_000
const MAX_LOCAL_DEPTH = 16
// Files the OS drops into folders on its own; their presence is not a stale copy.
const IGNORED_LOCAL_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

/** The two homes the bundle's install instructions require, in write order. */
export function corporateSkillHomeRoots(homeDir: string = homedir()): CorporateSkillHomeRoot[] {
  return [
    { home: 'agents', path: join(homeDir, '.agents', 'skills') },
    { home: 'claude', path: join(homeDir, '.claude', 'skills') }
  ]
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined
}

/** The blob hash, and the hash with CRLF folded to LF when the file looks like text. */
export function localBlobShas(bytes: Buffer): string[] {
  const exact = gitBlobSha(bytes).toString('hex')
  if (!bytes.includes(13) || bytes.includes(0)) {
    return [exact]
  }
  const folded = Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
  return [exact, gitBlobSha(folded).toString('hex')]
}

/** Relative path → candidate blob hashes, or null when the folder is not a plain tree. */
async function readLocalFiles(directory: string): Promise<Map<string, string[]> | null> {
  const files = new Map<string, string[]>()
  let seen = 0
  const walk = async (absolute: string, relative: string, depth: number): Promise<boolean> => {
    if (depth > MAX_LOCAL_DEPTH) {
      return false
    }
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      seen += 1
      if (seen > MAX_LOCAL_ENTRIES) {
        return false
      }
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name
      const childAbsolute = join(absolute, entry.name)
      if (entry.isDirectory()) {
        if (!(await walk(childAbsolute, childRelative, depth + 1))) {
          return false
        }
      } else if (entry.isFile()) {
        if (!IGNORED_LOCAL_FILES.has(entry.name)) {
          files.set(childRelative, localBlobShas(await readFile(childAbsolute)))
        }
      } else {
        // The bundle never ships links or devices, so this copy is not the bundle's.
        return false
      }
    }
    return true
  }
  return (await walk(directory, '', 0)) ? files : null
}

export async function observeCorporateSkillPlacement(
  directory: string,
  skill: CorporateRemoteSkill
): Promise<CorporateSkillPlacementState> {
  let stats
  try {
    stats = await lstat(directory)
  } catch (error) {
    return errorCode(error) === 'ENOENT' ? 'missing' : 'blocked'
  }
  if (stats.isSymbolicLink()) {
    return 'link'
  }
  if (!stats.isDirectory()) {
    return 'blocked'
  }
  let local: Map<string, string[]> | null
  try {
    local = await readLocalFiles(directory)
  } catch {
    return 'blocked'
  }
  if (!local || local.size !== skill.files.length) {
    return 'outdated'
  }
  const matches = skill.files.every((file) => local.get(file.path)?.includes(file.blobSha))
  return matches ? 'current' : 'outdated'
}

export async function observeCorporateSkills(
  skills: readonly CorporateRemoteSkill[],
  roots: readonly CorporateSkillHomeRoot[]
): Promise<CorporateSkillBundleSkill[]> {
  return Promise.all(
    skills.map(async (skill) => ({
      name: skill.name,
      placements: await Promise.all(
        roots.map(async (root) => {
          const path = join(root.path, skill.name)
          return { home: root.home, path, state: await observeCorporateSkillPlacement(path, skill) }
        })
      )
    }))
  )
}

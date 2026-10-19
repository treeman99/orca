// Reads the corporate skill bundle's current revision off the GitHub Enterprise host.
//
// Same road as the release lookup: `gh api` with `--hostname`, gh's own token, and the
// vendor host refused. The bundle has no tags — the head of its branch IS the release — so a
// check is the branch head plus that commit's recursive tree.

import type { AppUpdateLookupTarget } from '../../shared/app-update-check'
import {
  CORPORATE_SKILL_BUNDLE_BRANCH,
  CORPORATE_SKILL_BUNDLE_REPOSITORY
} from '../../shared/corporate-skill-bundle'
import { extractExecError } from '../git/exec-error'
import { ghExecFileAsync } from '../github/gh-utils'
import {
  resolveEnterpriseReleaseHost,
  type GhApiReader
} from '../app-update/enterprise-release-lookup'

const LOOKUP_TIMEOUT_MS = 20_000
// Why: the bundle is a handful of markdown files; anything near these bounds is not it.
const MAX_BUNDLE_FILES = 2_000
const MAX_BUNDLE_BYTES = 50 * 1024 * 1024
const SKILL_NAME = /^[a-z0-9][a-z0-9._-]*$/
const OBJECT_SHA = /^[0-9a-f]{40}$/

export type CorporateSkillFile = {
  /** Slash-separated path inside the skill folder. */
  path: string
  blobSha: string
  executable: boolean
}

export type CorporateRemoteSkill = {
  name: string
  treeSha: string
  files: CorporateSkillFile[]
}

export type CorporateRemoteBundle = {
  host: string
  repository: string
  branch: string
  commitSha: string
  skills: CorporateRemoteSkill[]
}

export type CorporateBundleLookupResult = { target: AppUpdateLookupTarget } & (
  | { outcome: 'found'; bundle: CorporateRemoteBundle }
  | { outcome: 'no-enterprise-host' }
  | { outcome: 'lookup-failed' }
  | { outcome: 'no-bundle' }
)

export function resolveCorporateSkillBundleTarget(): AppUpdateLookupTarget {
  return { host: resolveEnterpriseReleaseHost(), repository: CORPORATE_SKILL_BUNDLE_REPOSITORY }
}

async function readGhApi(path: string, host: string): Promise<unknown> {
  const { stdout } = await ghExecFileAsync(['api', path], { host, timeout: LOOKUP_TIMEOUT_MS })
  return JSON.parse(stdout) as unknown
}

function field(value: unknown, key: string): unknown {
  const read: unknown =
    typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
  return read
}

function stringField(value: unknown, key: string): string | null {
  const raw = field(value, key)
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

// Why: these paths become filesystem paths under the user's home. Git cannot store most of
// these, but the tree came over the network, so it is validated rather than trusted.
function isSafeRelativePath(path: string): boolean {
  return path
    .split('/')
    .every((part) => part.length > 0 && part !== '.' && part !== '..' && !/[\\:\0]/.test(part))
}

/**
 * The bundle inside a recursive tree listing, or null when the tree is not one Orca can
 * install faithfully — a symlink, a submodule, an unsafe path, or a truncated listing.
 */
export function parseCorporateSkillTree(
  listing: unknown
): Omit<CorporateRemoteBundle, 'host' | 'repository' | 'branch' | 'commitSha'> | null {
  if (field(listing, 'truncated') === true) {
    return null
  }
  const entries = field(listing, 'tree')
  if (!Array.isArray(entries)) {
    return null
  }
  const skills = new Map<string, CorporateRemoteSkill>()
  let totalFiles = 0
  let totalBytes = 0
  for (const entry of entries) {
    const path = stringField(entry, 'path')
    const sha = stringField(entry, 'sha')
    const type = stringField(entry, 'type')
    const mode = stringField(entry, 'mode')
    if (!path?.startsWith('skills/') || !sha || !OBJECT_SHA.test(sha)) {
      continue
    }
    const [, name, ...rest] = path.split('/')
    if (!name || !SKILL_NAME.test(name)) {
      return null
    }
    if (rest.length === 0) {
      if (type === 'tree') {
        skills.set(name, { name, treeSha: sha, files: [] })
      }
      continue
    }
    if (type === 'tree') {
      continue
    }
    const relative = rest.join('/')
    if (type !== 'blob' || (mode !== '100644' && mode !== '100755')) {
      return null
    }
    if (!isSafeRelativePath(relative)) {
      return null
    }
    totalFiles += 1
    const size = field(entry, 'size')
    totalBytes += typeof size === 'number' ? size : 0
    if (totalFiles > MAX_BUNDLE_FILES || totalBytes > MAX_BUNDLE_BYTES) {
      return null
    }
    const skill = skills.get(name)
    if (!skill) {
      return null
    }
    skill.files.push({ path: relative, blobSha: sha, executable: mode === '100755' })
  }
  // A folder without its own SKILL.md is not a skill (a template or asset folder).
  const usable = [...skills.values()]
    .filter((skill) => skill.files.some((file) => file.path === 'SKILL.md'))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
  return usable.length > 0 ? { skills: usable } : null
}

function isNotFound(error: unknown): boolean {
  const { stderr } = extractExecError(error)
  const message = error instanceof Error ? error.message : ''
  return /HTTP 404|Not Found/i.test(`${stderr}\n${message}`)
}

/**
 * The bundle at the head of its branch, or why there is none.
 *
 * Only the named branch is read — no fallback to the default branch, which is how a
 * repository holding upstream originals there would get them offered as an update. A
 * missing branch is `no-bundle`; every other failure is `lookup-failed`. Neither throws:
 * a machine with no `gh`, no token, or no read access ends the check quietly.
 */
export async function lookupCorporateSkillBundle(
  options: {
    target?: AppUpdateLookupTarget
    branch?: string
    readApi?: GhApiReader
  } = {}
): Promise<CorporateBundleLookupResult> {
  const target = options.target ?? resolveCorporateSkillBundleTarget()
  const branch = options.branch ?? CORPORATE_SKILL_BUNDLE_BRANCH
  const { host, repository } = target
  if (!host) {
    return { outcome: 'no-enterprise-host', target }
  }
  const readApi = options.readApi ?? readGhApi
  let head: unknown
  try {
    head = await readApi(`repos/${repository}/branches/${encodeURIComponent(branch)}`, host)
  } catch (error) {
    return { outcome: isNotFound(error) ? 'no-bundle' : 'lookup-failed', target }
  }
  const commit = field(head, 'commit')
  const commitSha = stringField(commit, 'sha')
  const treeSha = stringField(field(field(commit, 'commit'), 'tree'), 'sha')
  if (!commitSha || !OBJECT_SHA.test(commitSha) || !treeSha || !OBJECT_SHA.test(treeSha)) {
    return { outcome: 'lookup-failed', target }
  }
  let listing: unknown
  try {
    listing = await readApi(`repos/${repository}/git/trees/${treeSha}?recursive=1`, host)
  } catch {
    return { outcome: 'lookup-failed', target }
  }
  const parsed = parseCorporateSkillTree(listing)
  if (!parsed) {
    return { outcome: 'no-bundle', target }
  }
  return {
    outcome: 'found',
    target,
    bundle: { host, repository, branch, commitSha, skills: parsed.skills }
  }
}

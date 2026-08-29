import * as path from 'node:path'
import type { GitRuntimeOptions } from '../git-runtime-options'
import { gitOptionsForWorktree } from '../git-runtime-options'
import { gitExecFileAsync, gitOptionalLocksDisabledEnv } from '../runner'
import { gitRuntimeOptionsKey } from './git-runtime-options-cache-key'
import {
  parseSubmoduleConfigOutput,
  type GitSubmoduleConfigEntry
} from '../../../shared/git-submodule-list'
import { clearSubmoduleIgnorePolicyCache } from '../submodule-ignore-config'

const SUBMODULE_PATHS_CACHE_TTL_MS = 5_000
export const MAX_SUBMODULE_PATHS_CACHE_ENTRIES = 512
type SubmodulePathsCacheEntry = { entries: GitSubmoduleConfigEntry[]; expiresAt: number }
const submodulePathsCache = new Map<string, SubmodulePathsCacheEntry>()
let submodulePathsCacheGeneration = 0

export function clearSubmodulePathsCacheForTests(): void {
  clearSubmodulePathsCache()
}

export function clearSubmodulePathsCache(): void {
  submodulePathsCache.clear()
  clearSubmoduleIgnorePolicyCache()
  // Why: bump the generation so a pre-mutation read can't repopulate the invalidated cache.
  submodulePathsCacheGeneration += 1
}

export function getSubmodulePathsCacheCountForTests(): number {
  return submodulePathsCache.size
}

function getSubmodulePathsCacheKey(worktreePath: string, options: GitRuntimeOptions): string {
  // Why: the same path can map to different WSL-distro filesystems, so key the cache by runtime routing.
  return [worktreePath, ...gitRuntimeOptionsKey(options)].join('\0')
}

function pruneExpiredSubmodulePathsCache(now: number): void {
  for (const [cacheKey, entry] of submodulePathsCache) {
    if (entry.expiresAt <= now) {
      submodulePathsCache.delete(cacheKey)
    }
  }
}

function trimSubmodulePathsCache(): void {
  while (submodulePathsCache.size > MAX_SUBMODULE_PATHS_CACHE_ENTRIES) {
    const oldestKey = submodulePathsCache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    submodulePathsCache.delete(oldestKey)
  }
}

function getCachedSubmodulePaths(
  cacheKey: string,
  now: number
): GitSubmoduleConfigEntry[] | null {
  const cached = submodulePathsCache.get(cacheKey)
  if (!cached) {
    return null
  }
  if (cached.expiresAt <= now) {
    submodulePathsCache.delete(cacheKey)
    return null
  }
  submodulePathsCache.delete(cacheKey)
  submodulePathsCache.set(cacheKey, cached)
  return cached.entries
}

function rememberSubmodulePaths(
  cacheKey: string,
  entries: GitSubmoduleConfigEntry[],
  now: number
): void {
  submodulePathsCache.delete(cacheKey)
  submodulePathsCache.set(cacheKey, { entries, expiresAt: now + SUBMODULE_PATHS_CACHE_TTL_MS })
  trimSubmodulePathsCache()
}

/**
 * Resolve a submodule's own worktree path from a parent worktree + relative
 * submodule path, rejecting anything that escapes the parent.
 */
export function resolveSubmoduleWorktreePath(worktreePath: string, submodulePath: string): string {
  if (!submodulePath || submodulePath.includes('\0') || path.isAbsolute(submodulePath)) {
    throw new Error('Access denied: invalid submodule path')
  }
  const resolved = path.resolve(worktreePath, submodulePath)
  const rel = path.relative(worktreePath, resolved)
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error('Access denied: submodule path escapes the selected worktree')
  }
  return resolved
}

/**
 * List configured submodule entries (name + relative, forward-slash path) for a worktree,
 * cached briefly. Read from `.gitmodules` to avoid an index-wide `ls-files` scan.
 *
 * The name is kept because `submodule.<name>.ignore` is keyed by name, not path.
 */
export async function listSubmoduleConfigEntries(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<GitSubmoduleConfigEntry[]> {
  const now = Date.now()
  const cacheKey = getSubmodulePathsCacheKey(worktreePath, options)
  const cached = getCachedSubmodulePaths(cacheKey, now)
  if (cached) {
    return cached
  }
  // Why: prune on misses so removed worktrees don't accumulate; hot hits stay O(1).
  pruneExpiredSubmodulePathsCache(now)
  const cacheGeneration = submodulePathsCacheGeneration
  let entries: GitSubmoduleConfigEntry[] = []
  try {
    const { stdout } = await gitExecFileAsync(
      ['config', '--file', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$'],
      { ...gitOptionsForWorktree(worktreePath, options), env: gitOptionalLocksDisabledEnv() }
    )
    entries = parseSubmoduleConfigOutput(stdout)
  } catch {
    // No .gitmodules (or git config failure) — treat as a repo without submodules.
    entries = []
  }
  if (cacheGeneration === submodulePathsCacheGeneration) {
    rememberSubmodulePaths(cacheKey, entries, Date.now())
  }
  return entries
}

/** Configured submodule paths only (relative, forward-slash). */
export async function listSubmodulePaths(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<string[]> {
  return (await listSubmoduleConfigEntries(worktreePath, options)).map((entry) => entry.path)
}

/**
 * Find the submodule whose root equals or contains `filePath`. Returns the
 * submodule path (forward-slash) or null when the path is not in a submodule.
 */
export function findContainingSubmodule(submodulePaths: string[], filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '')
  let best: string | null = null
  for (const sub of submodulePaths) {
    if (normalized === sub || normalized.startsWith(`${sub}/`)) {
      // Prefer the longest match to support nested submodule roots.
      if (!best || sub.length > best.length) {
        best = sub
      }
    }
  }
  return best
}

/**
 * Relay half of the configured-submodule-`ignore` read, kept in lockstep with
 * src/main/git/submodule-ignore-config.ts so a local workspace and an SSH one
 * narrow the same gitlink rows. Parsing lives in src/shared.
 *
 * The cache is passed in (held by the GitHandler instance) so it is bound to the
 * connection lifecycle and never leaks across relay instances or tests.
 */
import {
  SUBMODULE_IGNORE_GITMODULES_ARGS,
  SUBMODULE_IGNORE_LOCAL_CONFIG_ARGS,
  buildSubmoduleIgnorePolicy,
  type SubmoduleIgnorePolicy
} from '../shared/git-submodule-ignore-policy'
import type { GitExec } from './git-handler-ops'

export const SUBMODULE_IGNORE_POLICY_CACHE_TTL_MS = 5_000
export const MAX_SUBMODULE_IGNORE_POLICY_CACHE_ENTRIES = 512

type CacheEntry = { policy: SubmoduleIgnorePolicy; expiresAt: number }
export type SubmoduleIgnorePolicyCache = {
  entries: Map<string, CacheEntry>
  generation: number
}

export function createSubmoduleIgnorePolicyCache(): SubmoduleIgnorePolicyCache {
  return { entries: new Map(), generation: 0 }
}

export function clearSubmoduleIgnorePolicyCache(cache: SubmoduleIgnorePolicyCache): void {
  cache.entries.clear()
  // Why: a pre-mutation SSH read must not restore a stale policy afterwards.
  cache.generation += 1
}

async function readConfig(
  git: GitExec,
  args: readonly string[],
  worktreePath: string
): Promise<string> {
  try {
    const { stdout } = await git([...args], worktreePath, { disableOptionalLocks: true })
    return stdout
  } catch {
    // `--get-regexp` exits 1 when nothing matches, and a missing `.gitmodules`
    // is an error too. Both mean "no policy configured".
    return ''
  }
}

export async function readSubmoduleIgnorePolicyCached(
  git: GitExec,
  worktreePath: string,
  cache: SubmoduleIgnorePolicyCache,
  now: number = Date.now()
): Promise<SubmoduleIgnorePolicy> {
  const cached = cache.entries.get(worktreePath)
  if (cached && cached.expiresAt > now) {
    cache.entries.delete(worktreePath)
    cache.entries.set(worktreePath, cached)
    return cached.policy
  }
  cache.entries.delete(worktreePath)
  const generation = cache.generation
  const [gitmodulesConfig, localConfig] = await Promise.all([
    readConfig(git, SUBMODULE_IGNORE_GITMODULES_ARGS, worktreePath),
    readConfig(git, SUBMODULE_IGNORE_LOCAL_CONFIG_ARGS, worktreePath)
  ])
  const policy = buildSubmoduleIgnorePolicy(gitmodulesConfig, localConfig)
  if (generation === cache.generation) {
    cache.entries.set(worktreePath, {
      policy,
      expiresAt: Date.now() + SUBMODULE_IGNORE_POLICY_CACHE_TTL_MS
    })
    while (cache.entries.size > MAX_SUBMODULE_IGNORE_POLICY_CACHE_ENTRIES) {
      const oldest = cache.entries.keys().next().value
      if (oldest === undefined) {
        break
      }
      cache.entries.delete(oldest)
    }
  }
  return policy
}

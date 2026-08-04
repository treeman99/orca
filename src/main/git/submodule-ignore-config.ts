/**
 * Reads the configured submodule `ignore` policy for a worktree, cached with the
 * same short TTL as the `.gitmodules` path list so a status poll running every
 * few seconds spends at most two `git config` reads per window.
 *
 * Only called once a poll has actually produced a gitlink row, so a clean tree —
 * or a repo without submodules — costs nothing. The parsing itself lives in
 * src/shared so the relay applies the identical policy over SSH.
 */
import {
  INERT_SUBMODULE_IGNORE_POLICY,
  SUBMODULE_IGNORE_GITMODULES_ARGS,
  SUBMODULE_IGNORE_LOCAL_CONFIG_ARGS,
  buildSubmoduleIgnorePolicy,
  type SubmoduleIgnorePolicy
} from '../../shared/git-submodule-ignore-policy'
import { gitExecFileAsync, gitOptionalLocksDisabledEnv } from './runner'
import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'

const SUBMODULE_IGNORE_POLICY_CACHE_TTL_MS = 5_000
const MAX_SUBMODULE_IGNORE_POLICY_CACHE_ENTRIES = 512

type CacheEntry = { policy: SubmoduleIgnorePolicy; expiresAt: number }

const cache = new Map<string, CacheEntry>()
let cacheGeneration = 0

export function clearSubmoduleIgnorePolicyCache(): void {
  cache.clear()
  // Why: a read that started before a mutation must not repopulate the cache.
  cacheGeneration += 1
}

export function getSubmoduleIgnorePolicyCacheCountForTests(): number {
  return cache.size
}

function cacheKey(worktreePath: string, options: GitRuntimeOptions): string {
  // Why: the same path can map to different WSL-distro filesystems.
  return `${options.wslDistro ?? 'native'}\0${worktreePath}`
}

async function readConfig(
  args: readonly string[],
  worktreePath: string,
  options: GitRuntimeOptions
): Promise<string> {
  try {
    const { stdout } = await gitExecFileAsync([...args], {
      ...gitOptionsForWorktree(worktreePath, options),
      env: gitOptionalLocksDisabledEnv()
    })
    return stdout
  } catch (error) {
    // Why rethrow an abort: an interrupted read is not evidence of "no policy
    // configured", and swallowing it would cache an inert policy for the whole
    // TTL — every poll in that window would skip narrowing and flash the gitlink
    // rows back. runNumstat (status.ts) rethrows aborts for the same reason.
    if (isAbortError(error, options.signal)) {
      throw error
    }
    // `--get-regexp` exits 1 when nothing matches, and a missing `.gitmodules`
    // is an error too. Both mean "no policy configured".
    return ''
  }
}

function isAbortError(error: unknown, signal: AbortSignal | undefined): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
  )
}

export async function readSubmoduleIgnorePolicy(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<SubmoduleIgnorePolicy> {
  const key = cacheKey(worktreePath, options)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) {
    // Refresh LRU position.
    cache.delete(key)
    cache.set(key, cached)
    return cached.policy
  }
  cache.delete(key)
  const generation = cacheGeneration
  let policy: SubmoduleIgnorePolicy
  try {
    const [gitmodulesConfig, localConfig] = await Promise.all([
      readConfig(SUBMODULE_IGNORE_GITMODULES_ARGS, worktreePath, options),
      readConfig(SUBMODULE_IGNORE_LOCAL_CONFIG_ARGS, worktreePath, options)
    ])
    policy = buildSubmoduleIgnorePolicy(gitmodulesConfig, localConfig)
  } catch (error) {
    // Why rethrow: an aborted read must not be recorded as "nothing configured".
    // The caller's status read is being cancelled anyway, and it rejects on abort
    // a few lines later regardless.
    if (isAbortError(error, options.signal)) {
      throw error
    }
    // Why not cache this: readConfig already absorbs every expected failure, so
    // reaching here means something unexpected — degrade for this poll only.
    return INERT_SUBMODULE_IGNORE_POLICY
  }
  if (generation === cacheGeneration) {
    cache.set(key, { policy, expiresAt: Date.now() + SUBMODULE_IGNORE_POLICY_CACHE_TTL_MS })
    while (cache.size > MAX_SUBMODULE_IGNORE_POLICY_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest === undefined) {
        break
      }
      cache.delete(oldest)
    }
  }
  return policy
}

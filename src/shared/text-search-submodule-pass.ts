/**
 * Second half of the git-grep fallback: search each initialized submodule.
 *
 * Why it is needed at all: `git grep --untracked` and `--recurse-submodules` are
 * mutually exclusive, so the parent pass runs `--no-recurse-submodules` and sees
 * nothing inside a submodule. A repo whose code all lives in submodules therefore
 * appeared to contain only the parent's own files. Running git once more per
 * submodule, with the submodule root as cwd, restores the missing half; the hits
 * come back prefixed so the panel still shows parent-relative paths.
 *
 * Depth 1 only — a submodule's own submodules are out of scope, matching the
 * boundary Source Control draws.
 *
 * The host callbacks exist because listing, guarding, and spawning differ between
 * the main process (WSL routing, Electron git runner) and the SSH relay, while the
 * budget, cap, and pathspec rules must not.
 */
import type { ChildProcessHandle } from './child-process/process-spec'
import { ingestGitGrepChild } from './git-grep-stream-ingest'
import { buildGitGrepArgs, type SearchAccumulator, type SearchOptionsLike } from './text-search'
import { translateSearchPatternsIntoSubmodule } from './text-search-submodule-pathspec'

// Why bounded: one git process per submodule, and a monorepo can configure dozens.
export const MAX_CONCURRENT_SUBMODULE_SEARCHES = 4

/**
 * Cap an auxiliary git call at whatever is left of the search budget.
 *
 * Why: enumeration and the root assertion are plain `git config` / `git rev-parse`
 * calls, but over a stalled SSH link either can hang indefinitely and there is no
 * child process to kill from here — a wedged one would outlive SEARCH_TIMEOUT_MS
 * and leave the panel spinning.
 */
async function withinBudget<T>(work: Promise<T>, remainingMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), Math.max(0, remainingMs))
      })
    ])
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
  }
}

export type SubmoduleSearchHost = {
  /** Initialized submodules only, parent-relative and forward-slash. Empty for a folder workspace. */
  listInitializedSubmodulePaths(rootPath: string): Promise<string[]>
  /**
   * Absolute path of the submodule's own worktree root. MUST run the containment
   * guard and the repository-root assertion — a deinitialized submodule directory
   * makes git walk up to the parent and double-count the parent's own matches.
   */
  resolveSubmoduleRoot(rootPath: string, submodulePath: string): Promise<string>
  spawnGitGrep(cwd: string, gitArgs: string[]): Promise<ChildProcessHandle>
}

export type SubmoduleSearchPassParams = {
  rootPath: string
  query: string
  opts: SearchOptionsLike
  matchRegex: RegExp | null
  acc: SearchAccumulator
  maxResults: number
  /** Absolute epoch ms shared with the parent pass; the whole search gets one budget. */
  deadlineAt: number
  host: SubmoduleSearchHost
  now?: () => number
}

async function searchOneSubmodule(
  params: SubmoduleSearchPassParams,
  submodulePath: string
): Promise<void> {
  const { rootPath, query, opts, matchRegex, acc, maxResults, deadlineAt, host } = params
  const now = params.now ?? Date.now
  if (acc.totalMatches >= maxResults) {
    return
  }
  const patterns = translateSearchPatternsIntoSubmodule(opts, submodulePath)
  if (patterns.kind === 'skip') {
    if (patterns.degraded) {
      acc.skippedSubmodules.push(submodulePath)
    }
    return
  }
  const submoduleRoot = await withinBudget(
    host.resolveSubmoduleRoot(rootPath, submodulePath),
    deadlineAt - now(),
    // Escapes the worktree, or is not a repository root (deinitialized / moved).
    null
  )
  if (submoduleRoot === null) {
    return
  }
  const remainingMs = deadlineAt - now()
  if (remainingMs <= 0) {
    acc.truncated = true
    return
  }
  const gitArgs = buildGitGrepArgs(query, {
    ...opts,
    includePattern: patterns.includePattern,
    excludePattern: patterns.excludePattern
  })
  let child: ChildProcessHandle
  try {
    child = await host.spawnGitGrep(submoduleRoot, gitArgs)
  } catch {
    return
  }
  await ingestGitGrepChild(child, {
    rootPath,
    matchRegex,
    acc,
    maxResults,
    timeoutMs: remainingMs,
    relPathPrefix: submodulePath
  })
}

/**
 * Fold every initialized submodule's matches into `acc`. Returns early when the
 * parent pass already hit `maxResults`, so a submodule-free repo pays only the
 * (TTL-cached) enumeration.
 */
export async function runGitGrepSubmodulePasses(params: SubmoduleSearchPassParams): Promise<void> {
  const { acc, deadlineAt, maxResults, rootPath, host } = params
  const now = params.now ?? Date.now
  if (acc.totalMatches >= maxResults) {
    return
  }
  // The parent pass already spent the whole budget; enumerating would only add latency.
  if (deadlineAt - now() <= 0) {
    acc.truncated = true
    return
  }
  const submodulePaths = await withinBudget(
    host.listInitializedSubmodulePaths(rootPath),
    deadlineAt - now(),
    []
  )
  if (submodulePaths.length === 0) {
    return
  }
  let next = 0
  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT_SUBMODULE_SEARCHES, submodulePaths.length) },
    async () => {
      while (next < submodulePaths.length) {
        const submodulePath = submodulePaths[next++]
        if (acc.totalMatches >= maxResults) {
          return
        }
        await searchOneSubmodule(params, submodulePath)
      }
    }
  )
  await Promise.all(workers)
}

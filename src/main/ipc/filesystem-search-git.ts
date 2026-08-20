import type { SearchOptions, SearchResult } from '../../shared/code-search-types'
import { ingestGitGrepChild } from '../../shared/git-grep-stream-ingest'
import {
  buildGitGrepArgs,
  buildSubmatchRegex,
  createAccumulator,
  finalize,
  SEARCH_TIMEOUT_MS
} from '../../shared/text-search'
import { runGitGrepSubmodulePasses } from '../../shared/text-search-submodule-pass'
import {
  isWslLinkedWorktreeGitRoutingCandidate,
  prepareWslLinkedWorktreeGitRouting
} from '../git/wsl-linked-worktree-git-routing'
import { createLocalSubmoduleSearchHost } from './filesystem-search-git-submodules'

/**
 * Fallback text search using git grep. Used when rg is not available.
 *
 * Why: On Linux, rg may not be installed or may not be in PATH when the app
 * is launched from a desktop entry (which inherits a minimal system PATH).
 * git grep is always available since this is a git-focused app.
 *
 * Two passes: the parent worktree with `--untracked --no-recurse-submodules`
 * (git refuses to combine those two), then one pass per initialized submodule.
 * Without the second pass a repo whose code lives in submodules looks empty.
 */
export async function searchWithGitGrep(
  rootPath: string,
  args: SearchOptions,
  maxResults: number,
  localGitOptions: { wslDistro?: string } = {}
): Promise<SearchResult> {
  const deadlineAt = Date.now() + SEARCH_TIMEOUT_MS
  if (isWslLinkedWorktreeGitRoutingCandidate(rootPath, localGitOptions.wslDistro)) {
    await prepareWslLinkedWorktreeGitRouting(rootPath, localGitOptions.wslDistro)
  }
  const host = createLocalSubmoduleSearchHost(localGitOptions)
  const acc = createAccumulator()
  const matchRegex = buildSubmatchRegex(args.query, args)

  try {
    const child = await host.spawnGitGrep(rootPath, buildGitGrepArgs(args.query, args))
    await ingestGitGrepChild(child, {
      rootPath,
      matchRegex,
      acc,
      maxResults,
      timeoutMs: deadlineAt - Date.now()
    })
  } catch {
    // A failed parent pass must not cost the submodule results.
  }

  await runGitGrepSubmodulePasses({
    rootPath,
    query: args.query,
    opts: args,
    matchRegex,
    acc,
    maxResults,
    deadlineAt,
    host
  })
  return finalize(acc, 'git-grep')
}

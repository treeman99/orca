import { abortSignalReason } from '../shared/abort-signal-reason'
import type { SearchOptions, SearchResult } from './fs-handler-utils'
import { ingestGitGrepChild } from '../shared/git-grep-stream-ingest'
import { GitGrepRecordCapacityError } from '../shared/git-grep-record-limit'
import {
  buildGitGrepArgs,
  buildSubmatchRegex,
  createAccumulator,
  finalize,
  SEARCH_TIMEOUT_MS
} from '../shared/text-search'
import { runGitGrepSubmodulePasses } from '../shared/text-search-submodule-pass'
import { relaySubmoduleSearchHost, spawnRelayGitGrep } from './fs-handler-git-search-submodules'

/**
 * Text search using `git grep`. Fallback when rg is not installed.
 *
 * Two passes: the parent worktree with `--untracked --no-recurse-submodules` (git
 * refuses to combine those two), then one pass per initialized submodule. Without
 * the second pass a remote repo whose code lives in submodules looks empty.
 */
export async function searchWithGitGrep(
  rootPath: string,
  query: string,
  opts: SearchOptions
): Promise<SearchResult> {
  const { signal } = opts
  if (signal?.aborted) {
    throw abortSignalReason(signal)
  }
  const deadlineAt = Date.now() + SEARCH_TIMEOUT_MS
  const acc = createAccumulator()
  const matchRegex = buildSubmatchRegex(query, opts)
  const host = relaySubmoduleSearchHost

  try {
    const child = spawnRelayGitGrep(rootPath, buildGitGrepArgs(query, opts))
    await ingestGitGrepChild(child, {
      rootPath,
      matchRegex,
      acc,
      maxResults: opts.maxResults,
      timeoutMs: deadlineAt - Date.now(),
      signal
    })
  } catch (error) {
    // A failed parent pass must not cost the submodule results; an over-long record is not a
    // failure to degrade past — the results would silently miss it.
    if (error instanceof GitGrepRecordCapacityError) {
      throw error
    }
  }
  // Why: an abandoned request must not start one more git per submodule.
  if (signal?.aborted) {
    throw abortSignalReason(signal)
  }

  await runGitGrepSubmodulePasses({
    rootPath,
    query,
    opts,
    matchRegex,
    acc,
    maxResults: opts.maxResults,
    deadlineAt,
    host,
    signal
  })
  if (signal?.aborted) {
    throw abortSignalReason(signal)
  }
  return finalize(acc, 'git-grep')
}

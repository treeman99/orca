/**
 * Drain one `git grep` child into a shared search accumulator.
 *
 * Why it is shared: the local main process and the SSH relay both run the same
 * fallback, and the parent pass and each submodule pass run it again with a
 * different cwd. One implementation keeps the truncation ordering (`acc.truncated`
 * flipped in the same tick the child is killed) identical everywhere.
 *
 * The child-process import is type-only — this module spawns nothing.
 */
import type { ChildProcessHandle } from './child-process/process-spec'
import { SearchSubprocessLineAccumulator } from './search-subprocess-lines'
import {
  absorbPendingRipgrepSpawnError,
  killSpawnedRipgrepProcess
} from './ripgrep-process-availability'
import { ingestGitGrepLine, type SearchAccumulator } from './text-search'
import { GitGrepRecordCapacityError, GIT_GREP_MAX_RECORD_BYTES } from './git-grep-record-limit'

export type GitGrepIngestOptions = {
  /** Always the PARENT worktree root, so submodule hits resolve to parent-relative paths. */
  rootPath: string
  matchRegex: RegExp | null
  acc: SearchAccumulator
  maxResults: number
  /** Remaining slice of the whole-search budget, not a per-child timeout. */
  timeoutMs: number
  /** Parent-relative root of the submodule this child is grepping, when it is one. */
  relPathPrefix?: string
  /** Abandoned request: kill the child and release every listener without waiting for its exit. */
  signal?: AbortSignal
}

/**
 * Resolves once the child ends, is killed at `maxResults`, or the budget expires.
 * A failed fallback pass degrades to the matches collected so far; only a record past
 * GIT_GREP_MAX_RECORD_BYTES rejects, because dropping it would hide a match silently.
 */
export function ingestGitGrepChild(
  child: ChildProcessHandle,
  { rootPath, matchRegex, acc, maxResults, timeoutMs, relPathPrefix, signal }: GitGrepIngestOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    const lines = new SearchSubprocessLineAccumulator(GIT_GREP_MAX_RECORD_BYTES)
    let done = false
    let processErrorObserved = false
    let killTimeout: ReturnType<typeof setTimeout>

    function settle(): boolean {
      if (done) {
        return false
      }
      done = true
      signal?.removeEventListener('abort', onAbort)
      lines.clear()
      clearTimeout(killTimeout)
      // Why: child.kill() is advisory. If git ignores it, detach our closures so
      // repeated fallback searches do not retain old scans.
      child.stdout?.off('data', handleStdoutData)
      child.stderr?.off('data', handleStderrData)
      child.off('error', handleError)
      child.off('close', handleClose)
      absorbPendingRipgrepSpawnError(child, {
        errorObserved: processErrorObserved,
        unavailableExitObserved: false
      })
      return true
    }

    function resolveOnce(): void {
      if (settle()) {
        resolve()
      }
    }

    function onAbort(): void {
      if (done) {
        return
      }
      try {
        killSpawnedRipgrepProcess(child)
      } catch {
        // A refused kill must still release the canceled request.
      }
      resolveOnce()
    }

    function processLine(line: string): void {
      const verdict = ingestGitGrepLine(line, rootPath, matchRegex, acc, maxResults, relPathPrefix)
      if (verdict === 'stop') {
        child.kill()
      }
    }

    function handleStdoutData(chunk: Buffer | string): void {
      if (!lines.push(chunk, processLine) && settle()) {
        try {
          killSpawnedRipgrepProcess(child)
        } catch {
          // Release the request even when the host refuses the kill.
        }
        reject(new GitGrepRecordCapacityError())
      }
    }

    function handleStderrData(): void {
      /* drain */
    }

    function handleError(): void {
      processErrorObserved = true
      resolveOnce()
    }

    function handleClose(): void {
      const tail = lines.finish()
      if (tail !== null) {
        processLine(tail)
      }
      resolveOnce()
    }

    child.stdout?.on('data', handleStdoutData)
    child.stderr?.on('data', handleStderrData)
    child.once('error', handleError)
    child.once('close', handleClose)

    killTimeout = setTimeout(
      () => {
        acc.truncated = true
        child.kill()
        resolveOnce()
      },
      Math.max(0, timeoutMs)
    )
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
    }
  })
}

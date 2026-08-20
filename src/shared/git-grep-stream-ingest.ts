/**
 * Drain one `git grep` child into a shared search accumulator.
 *
 * Why it is shared: the local main process and the SSH relay both run the same
 * fallback, and the parent pass and each submodule pass run it again with a
 * different cwd. One implementation keeps the truncation ordering (`acc.truncated`
 * flipped in the same tick the child is killed) identical everywhere.
 *
 * The `node:child_process` import is type-only — this module spawns nothing.
 */
import type { ChildProcess } from 'node:child_process'
import { ingestGitGrepLine, type SearchAccumulator } from './text-search'

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
}

/**
 * Resolves once the child ends, is killed at `maxResults`, or the budget expires.
 * Never rejects: a failed fallback pass degrades to the matches collected so far.
 */
export function ingestGitGrepChild(
  child: ChildProcess,
  { rootPath, matchRegex, acc, maxResults, timeoutMs, relPathPrefix }: GitGrepIngestOptions
): Promise<void> {
  return new Promise((resolve) => {
    let stdoutBuffer = ''
    let done = false
    let killTimeout: ReturnType<typeof setTimeout>

    function resolveOnce(): void {
      if (done) {
        return
      }
      done = true
      clearTimeout(killTimeout)
      // Why: child.kill() is advisory. If git ignores it, detach our closures so
      // repeated fallback searches do not retain old scans.
      child.stdout?.off('data', handleStdoutData)
      child.stderr?.off('data', handleStderrData)
      child.off('error', handleError)
      child.off('close', handleClose)
      resolve()
    }

    function processLine(line: string): void {
      const verdict = ingestGitGrepLine(line, rootPath, matchRegex, acc, maxResults, relPathPrefix)
      if (verdict === 'stop') {
        child.kill()
      }
    }

    function handleStdoutData(chunk: string): void {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''
      for (const line of lines) {
        processLine(line)
      }
    }

    function handleStderrData(): void {
      /* drain */
    }

    function handleError(): void {
      resolveOnce()
    }

    function handleClose(): void {
      if (stdoutBuffer) {
        processLine(stdoutBuffer)
      }
      resolveOnce()
    }

    child.stdout?.setEncoding('utf-8')
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
  })
}

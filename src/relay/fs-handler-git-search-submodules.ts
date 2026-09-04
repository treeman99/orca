/**
 * Relay adapter that lets the git-grep fallback search inside submodules.
 *
 * Kept in lockstep with src/main/ipc/filesystem-search-git-submodules.ts — a
 * divergence here is invisible until someone searches over SSH.
 *
 * Enumeration reuses `listSubmodulePathsCached` so a repo without submodules pays
 * one TTL-cached `git config` per search. The cache is module-scoped rather than
 * borrowed from GitHandler because FsHandler has no reference to it; a read-only
 * search tolerating a 5s-stale `.gitmodules` is the whole cost of that.
 */
import type { ChildProcessHandle } from '../shared/child-process/process-spec'
import { runProcess, spawnProcess } from '../shared/child-process/run-process'
import type { SubmoduleSearchHost } from '../shared/text-search-submodule-pass'
import type { GitExec } from './git-handler-ops'
import {
  assertSubmoduleWorktreeRoot,
  createSubmodulePathsCache,
  listSubmodulePathsCached,
  resolveSubmoduleWorktreePath
} from './git-handler-submodule-ops'
import { buildRelayGitEnv } from './relay-command-env'

const submodulePathsCache = createSubmodulePathsCache()

// Only `git config --file .gitmodules` and `git rev-parse --show-prefix` run through
// here, so the runner's default output cap and 30s deadline are both generous — and the
// deadline is new ground: `execFile` had none, so a wedged git blocked a remote search
// forever. Callers read a non-zero
// exit as "no submodules"/"not a repository root", so it has to throw the way execFile
// did rather than return the code.
const gitExec: GitExec = async (args, cwd) => {
  const result = await runProcess({ program: 'git', args, cwd, env: buildRelayGitEnv() })
  if (result.code === 0 && !result.timedOut) {
    return { stdout: result.stdout, stderr: result.stderr }
  }
  throw Object.assign(
    new Error(
      result.timedOut
        ? `git ${args[0] ?? 'command'} timed out.`
        : result.stderr.trim() || `git ${args[0] ?? 'command'} failed.`
    ),
    { code: result.code, killed: result.timedOut, signal: result.signal }
  )
}

export const relaySubmoduleSearchHost: SubmoduleSearchHost = {
  async listInitializedSubmodulePaths(rootPath: string): Promise<string[]> {
    // Configured, not yet proven initialized — resolveSubmoduleRoot's root
    // assertion rejects a deinitialized directory before git runs in it.
    return listSubmodulePathsCached(gitExec, rootPath, submodulePathsCache)
  },
  async resolveSubmoduleRoot(rootPath: string, submodulePath: string): Promise<string> {
    // Containment first, then "is it really a repository root": a deinitialized
    // submodule directory makes git walk up and re-scan the parent, double-counting it.
    const submoduleRoot = resolveSubmoduleWorktreePath(rootPath, submodulePath)
    await assertSubmoduleWorktreeRoot(gitExec, submoduleRoot)
    return submoduleRoot
  },
  spawnGitGrep(cwd: string, gitArgs: string[]): Promise<ChildProcessHandle> {
    return Promise.resolve(
      spawnProcess({
        program: 'git',
        args: gitArgs,
        cwd,
        env: buildRelayGitEnv(),
        stdio: ['ignore', 'pipe', 'pipe']
      })
    )
  }
}

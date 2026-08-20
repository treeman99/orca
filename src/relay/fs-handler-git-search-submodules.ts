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
import { execFile, spawn, type ChildProcess } from 'node:child_process'
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

// Only `git config --file .gitmodules` and `git rev-parse --show-prefix` run
// through here, so execFile's default 1MB buffer is already generous.
const gitExec: GitExec = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, env: buildRelayGitEnv(), encoding: 'utf-8' },
      (error, stdout, stderr) => {
        if (error) {
          reject(error)
          return
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) })
      }
    )
  })

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
  spawnGitGrep(cwd: string, gitArgs: string[]): Promise<ChildProcess> {
    return Promise.resolve(
      spawn('git', gitArgs, {
        cwd,
        env: buildRelayGitEnv(),
        stdio: ['ignore', 'pipe', 'pipe']
      })
    )
  }
}

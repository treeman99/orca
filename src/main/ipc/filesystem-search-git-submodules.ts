/**
 * Local-process adapter that lets the git-grep fallback search inside submodules.
 *
 * Enumeration reuses `listSubmodules` (`.gitmodules`-backed, 5s TTL cached, already
 * carrying the `initialized` flag), so a repo without submodules pays one cached
 * `git config` per search and nothing else. A folder workspace degrades to an empty list.
 */
import type { ChildProcess } from 'node:child_process'
import type { SubmoduleSearchHost } from '../../shared/text-search-submodule-pass'
import { gitSpawnAfterWindowsEnvironmentReady } from '../git/runner'
import { assertSubmoduleWorktreeRoot, resolveSubmoduleWorktreePath } from '../git/status'
import { listSubmodules } from '../git/submodule-write-ops'

export function createLocalSubmoduleSearchHost(localGitOptions: {
  wslDistro?: string
}): SubmoduleSearchHost {
  const wslOption = localGitOptions.wslDistro ? { wslDistro: localGitOptions.wslDistro } : {}
  return {
    async listInitializedSubmodulePaths(rootPath: string): Promise<string[]> {
      const { submodules } = await listSubmodules(rootPath, wslOption)
      return submodules.filter((submodule) => submodule.initialized).map(({ path }) => path)
    },
    async resolveSubmoduleRoot(rootPath: string, submodulePath: string): Promise<string> {
      // Containment first, then "is it really a repository root": a deinitialized
      // submodule directory makes git walk up and re-scan the parent, double-counting it.
      const submoduleRoot = resolveSubmoduleWorktreePath(rootPath, submodulePath)
      await assertSubmoduleWorktreeRoot(submoduleRoot, wslOption)
      return submoduleRoot
    },
    spawnGitGrep(cwd: string, gitArgs: string[]): Promise<ChildProcess> {
      return gitSpawnAfterWindowsEnvironmentReady(gitArgs, {
        cwd,
        admissionTier: 'interactive',
        ...wslOption,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    }
  }
}

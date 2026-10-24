import { createWebGitMergeConflictApi } from './web-git-merge-conflict-api'
import { createWebGitSubmoduleApi } from './web-git-submodule-api'

/** Fork-only Git methods, spread into createGitApi by one line: web-git-api.ts sits at the max-lines cap. */
export function createWebGitForkApi(): ReturnType<typeof createWebGitSubmoduleApi> &
  ReturnType<typeof createWebGitMergeConflictApi> {
  return { ...createWebGitSubmoduleApi(), ...createWebGitMergeConflictApi() }
}

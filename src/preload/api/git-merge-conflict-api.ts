import type { GitMergeConflictInputs } from '../../shared/git-merge-conflict-inputs'

/** Fork: index stage reads behind the VS Code-style merge editor. */
export type GitMergeConflictApi = {
  mergeConflictInputs: (args: {
    worktreePath: string
    filePath: string
    connectionId?: string
  }) => Promise<GitMergeConflictInputs>
}

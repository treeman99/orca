import { defineMethod } from '../core'
import { remoteRpcContentBudget } from '../../../../shared/remote-rpc-content-budget'
import { GitFilePath } from '../../../../shared/rpc-contract/git-params'

export const GIT_MERGE_CONFLICT_METHODS = [
  defineMethod({
    name: 'git.mergeConflictInputs',
    permission: 'workspace',
    params: GitFilePath,
    // Why: clientKind is set only for WebSocket-transported requests, so desktop-local and
    // in-process callers keep the uncapped stage contents.
    handler: async (params, { runtime, clientKind, requestId }) =>
      runtime.getRuntimeGitMergeConflictInputs(
        params.worktree,
        params.filePath,
        clientKind && requestId ? remoteRpcContentBudget(requestId) : undefined
      )
  })
]

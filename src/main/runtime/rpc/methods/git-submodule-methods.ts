// Fork: Source Control submodule RPCs, kept out of git.ts so upstream growth there cannot push
// these lines into a max-lines bypass. Same permission as every other git method.
import { defineMethod } from '../core'
import {
  GitSubmoduleCommit,
  GitSubmoduleFilePath,
  GitSubmodulePaths,
  GitSubmodulePointer,
  GitSubmodulePush,
  WorktreeSelector
} from './git-params'

export const GIT_SUBMODULE_METHODS = [
  defineMethod({
    name: 'git.submoduleDiscard',
    permission: 'workspace',
    params: GitSubmoduleFilePath,
    handler: async (params, { runtime }) =>
      runtime.discardRuntimeGitSubmodulePath(params.worktree, params.submodulePath, params.filePath)
  }),
  defineMethod({
    name: 'git.submoduleList',
    permission: 'workspace',
    params: WorktreeSelector,
    handler: async (params, { runtime }) => runtime.listRuntimeGitSubmodules(params.worktree)
  }),
  defineMethod({
    name: 'git.submoduleStage',
    permission: 'workspace',
    params: GitSubmodulePaths,
    handler: async (params, { runtime }) =>
      runtime.stageRuntimeGitSubmodulePaths(params.worktree, params.submodulePath, params.filePaths)
  }),
  defineMethod({
    name: 'git.submoduleUnstage',
    permission: 'workspace',
    params: GitSubmodulePaths,
    handler: async (params, { runtime }) =>
      runtime.unstageRuntimeGitSubmodulePaths(
        params.worktree,
        params.submodulePath,
        params.filePaths
      )
  }),
  defineMethod({
    name: 'git.submoduleCommit',
    permission: 'workspace',
    params: GitSubmoduleCommit,
    handler: async (params, { runtime }) =>
      runtime.commitRuntimeGitSubmodule(params.worktree, params.submodulePath, params.message)
  }),
  defineMethod({
    name: 'git.submodulePush',
    permission: 'workspace',
    params: GitSubmodulePush,
    handler: async (params, { runtime }) =>
      params.publish === undefined
        ? runtime.pushRuntimeGitSubmodule(params.worktree, params.submodulePath)
        : runtime.pushRuntimeGitSubmodule(params.worktree, params.submodulePath, params.publish)
  }),
  defineMethod({
    name: 'git.submodulePull',
    permission: 'workspace',
    params: GitSubmodulePointer,
    handler: async (params, { runtime }) =>
      runtime.pullRuntimeGitSubmodule(params.worktree, params.submodulePath)
  }),
  defineMethod({
    name: 'git.submoduleRestorePointer',
    permission: 'workspace',
    params: GitSubmodulePointer,
    handler: async (params, { runtime }) =>
      runtime.restoreRuntimeGitSubmodulePointer(params.worktree, params.submodulePath)
  })
]

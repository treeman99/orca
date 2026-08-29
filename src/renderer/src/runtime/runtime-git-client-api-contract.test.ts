import { describe, expect, it } from 'vitest'
import * as runtimeGitClient from './runtime-git-client'

const PUBLIC_RUNTIME_GIT_CLIENT_FUNCTIONS = [
  // Fork additions: submodule SCM parity with VS Code (8 entries).
  'abortRuntimeGitMerge',
  'abortRuntimeGitRebase',
  'bulkDiscardRuntimeGitPaths',
  'bulkStageRuntimeGitPaths',
  'bulkUnstageRuntimeGitPaths',
  'cancelRuntimeGenerateCommitMessage',
  'cancelRuntimeGeneratePullRequestFields',
  'commitRuntimeGit',
  'commitRuntimeGitSubmodule',
  'discardRuntimeGitPath',
  'discardRuntimeGitSubmodulePath',
  'discoverRuntimeCommitMessageModels',
  'fastForwardRuntimeGit',
  'fetchRuntimeGit',
  'generateRuntimeCommitMessage',
  'generateRuntimePullRequestFields',
  'getRuntimeGitBranchCompare',
  'getRuntimeGitBranchDiff',
  'getRuntimeGitCommitCompare',
  'getRuntimeGitCommitDiff',
  'getRuntimeGitConflictOperation',
  'getRuntimeGitDiff',
  'getRuntimeGitHistory',
  'getRuntimeGitIgnoredPaths',
  'getRuntimeGitRemoteCommitUrl',
  'getRuntimeGitRemoteFileUrl',
  'getRuntimeGitScope',
  'getRuntimeGitStatus',
  'getRuntimeGitSubmoduleStatus',
  'getRuntimeGitUpstreamStatus',
  'listRuntimeGitSubmodules',
  'pullRuntimeGit',
  'pullRuntimeGitSubmodule',
  'pushRuntimeGit',
  'pushRuntimeGitSubmodule',
  'rebaseRuntimeGitFromBase',
  'restoreRuntimeGitSubmodulePointer',
  'setRuntimeGitStatusUpstreamRefWatch',
  'stageRuntimeGitPath',
  'stageRuntimeGitSubmodulePaths',
  'syncRuntimeGitForkDefaultBranch',
  'unstageRuntimeGitPath',
  'unstageRuntimeGitSubmodulePaths'
] as const

describe('runtime Git client API contract', () => {
  it('keeps the stable renderer facade exact and callable', () => {
    const exported: Record<string, unknown> = { ...runtimeGitClient }
    expect(Object.keys(exported).sort()).toEqual([...PUBLIC_RUNTIME_GIT_CLIENT_FUNCTIONS])
    for (const functionName of PUBLIC_RUNTIME_GIT_CLIENT_FUNCTIONS) {
      expect(exported[functionName]).toBeTypeOf('function')
    }
  })
})

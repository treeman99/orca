import type { GitForkSyncExpectedUpstream, GitForkSyncResult } from '../../shared/git-fork-sync'
import type { TuiAgent } from '../../shared/tui-agent'
import type { GitPushTarget } from '../../shared/worktree/types'
import type { HostedReviewProvider } from '../../shared/hosted-review'
import type { GitSubmoduleListResult } from '../../shared/git-submodule-list'
import type { ResolvedSourceControlAiGenerationParams } from '../../shared/source-control-ai'
import type { SourceControlAiSettings } from '../../shared/source-control-ai-types'

export type GitOperationApi = {
  appendGitignore: (args: { worktreePath: string; folderName: string }) => Promise<boolean>
  abortMerge: (args: { worktreePath: string; connectionId?: string }) => Promise<void>
  abortRebase: (args: { worktreePath: string; connectionId?: string }) => Promise<void>
  fetch: (args: {
    worktreePath: string
    connectionId?: string
    pushTarget?: GitPushTarget
  }) => Promise<void>
  syncFork: (args: {
    worktreePath: string
    connectionId?: string
    expectedUpstream: GitForkSyncExpectedUpstream
  }) => Promise<GitForkSyncResult>
  push: (args: {
    worktreePath: string
    publish?: boolean
    forceWithLease?: boolean
    connectionId?: string
    pushTarget?: GitPushTarget
  }) => Promise<void>
  pull: (args: {
    worktreePath: string
    connectionId?: string
    pushTarget?: GitPushTarget
  }) => Promise<void>
  fastForward: (args: {
    worktreePath: string
    connectionId?: string
    pushTarget?: GitPushTarget
  }) => Promise<void>
  rebaseFromBase: (args: {
    worktreePath: string
    baseRef: string
    connectionId?: string
  }) => Promise<void>
  commit: (args: {
    worktreePath: string
    message: string
    connectionId?: string
  }) => Promise<{ success: boolean; error?: string }>
  generateCommitMessage: (args: {
    worktreePath: string
    /** Raw (unstripped) worktree meta key; validated against worktreePath in main. */
    worktreeId?: string
    repoId?: string
    connectionId?: string
    sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
    sourceControlAi?: SourceControlAiSettings
    agentCmdOverrides?: Partial<Record<TuiAgent, string>>
  }) => Promise<
    | { success: true; message: string; agentLabel?: string }
    | { success: false; error: string; canceled?: boolean }
  >
  cancelGenerateCommitMessage: (args: {
    worktreePath: string
    connectionId?: string
  }) => Promise<void>
  generatePullRequestFields: (args: {
    worktreePath: string
    /** Raw (unstripped) worktree meta key; validated against worktreePath in main. */
    worktreeId?: string
    repoId?: string
    base: string
    title: string
    body: string
    draft: boolean
    provider?: HostedReviewProvider
    useTemplate?: boolean
    connectionId?: string
    sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
    sourceControlAi?: SourceControlAiSettings
    agentCmdOverrides?: Partial<Record<TuiAgent, string>>
  }) => Promise<
    | {
        success: true
        fields: { base: string; title: string; body: string; draft: boolean }
        agentLabel?: string
        branchChangedByPreparation?: boolean
      }
    | {
        success: false
        error: string
        canceled?: boolean
        branchChangedByPreparation?: boolean
      }
  >
  cancelGeneratePullRequestFields: (args: {
    worktreePath: string
    connectionId?: string
  }) => Promise<void>
  stage: (args: { worktreePath: string; filePath: string; connectionId?: string }) => Promise<void>
  bulkStage: (args: {
    worktreePath: string
    filePaths: string[]
    connectionId?: string
  }) => Promise<void>
  unstage: (args: {
    worktreePath: string
    filePath: string
    connectionId?: string
  }) => Promise<void>
  bulkUnstage: (args: {
    worktreePath: string
    filePaths: string[]
    connectionId?: string
  }) => Promise<void>
  discard: (args: {
    worktreePath: string
    filePath: string
    connectionId?: string
  }) => Promise<void>
  /** `filePath` is relative to the SUBMODULE root, not the parent worktree. */
  submoduleDiscard: (args: {
    worktreePath: string
    submodulePath: string
    filePath: string
    connectionId?: string
  }) => Promise<void>
  /** `git submodule update --init` — restores the recorded pointer, detaching its HEAD. */
  submoduleRestorePointer: (args: {
    worktreePath: string
    submodulePath: string
    connectionId?: string
  }) => Promise<void>
  bulkDiscard: (args: {
    worktreePath: string
    filePaths: string[]
    connectionId?: string
  }) => Promise<void>
  /** Configured submodules of the parent worktree, capped at MAX_DETECTED_SUBMODULES. */
  submoduleList: (args: {
    worktreePath: string
    connectionId?: string
  }) => Promise<GitSubmoduleListResult>
  /** `filePaths` are relative to the SUBMODULE root, not the parent worktree. */
  submoduleStage: (args: {
    worktreePath: string
    submodulePath: string
    filePaths: string[]
    connectionId?: string
  }) => Promise<void>
  /** `filePaths` are relative to the SUBMODULE root, not the parent worktree. */
  submoduleUnstage: (args: {
    worktreePath: string
    submodulePath: string
    filePaths: string[]
    connectionId?: string
  }) => Promise<void>
  submoduleCommit: (args: {
    worktreePath: string
    submodulePath: string
    message: string
    connectionId?: string
  }) => Promise<{ success: boolean; error?: string }>
  submodulePush: (args: {
    worktreePath: string
    submodulePath: string
    publish?: boolean
    connectionId?: string
  }) => Promise<void>
  /** Pull the submodule's own branch — the pull half of a submodule Sync Changes. */
  submodulePull: (args: {
    worktreePath: string
    submodulePath: string
    connectionId?: string
  }) => Promise<void>
}

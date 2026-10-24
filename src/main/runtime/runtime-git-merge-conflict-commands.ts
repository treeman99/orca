import type {
  GitMergeConflictInputs,
  GitMergeConflictStage
} from '../../shared/git-merge-conflict-inputs'
import { remoteRpcResultExceedsContentBudget } from '../../shared/remote-rpc-content-budget'
import {
  normalizeRuntimeGitRelativePath,
  requireRuntimeGitProvider,
  type RuntimeGitCommandHost
} from './runtime-git-command-target'

export class RuntimeGitMergeConflictCommands {
  constructor(private readonly host: RuntimeGitCommandHost) {}

  // Why: cap the payload after execution-host dispatch, as getRuntimeGitDiff does.
  async getRuntimeGitMergeConflictInputs(
    worktreeSelector: string,
    filePath: string,
    maxContentBytes?: number
  ): Promise<GitMergeConflictInputs> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePath = normalizeRuntimeGitRelativePath(filePath)
    const inputs = await requireRuntimeGitProvider(target).getMergeConflictInputs(
      target.worktree.path,
      relativePath
    )
    return fitMergeConflictInputsToBudget(inputs, maxContentBytes)
  }
}

/** `maxBytes === undefined` means uncapped: local and in-process callers keep full fidelity. */
function fitMergeConflictInputsToBudget(
  inputs: GitMergeConflictInputs,
  maxBytes: number | undefined
): GitMergeConflictInputs {
  if (maxBytes === undefined || !remoteRpcResultExceedsContentBudget(inputs, maxBytes)) {
    return inputs
  }
  // Why not throw like a diff: the renderer reads tooLarge as "keep the text editor".
  const emptied = (stage: GitMergeConflictStage): GitMergeConflictStage => ({
    ...stage,
    content: ''
  })
  return {
    ...inputs,
    base: emptied(inputs.base),
    ours: emptied(inputs.ours),
    theirs: emptied(inputs.theirs),
    tooLarge: true
  }
}

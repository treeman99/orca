import type { GitConflictOperation } from '../../../../../shared/git-status-types'

/**
 * VS Code's Source Control view shows exactly one primary button whose identity
 * rotates with repository state (`getCommitActionButton() ?? getPublishBranchActionButton()
 * ?? getSyncChangesActionButton() ?? getCommitActionButton()`). This reproduces that
 * precedence. Labels stay out of here so the panel owns every user-facing string.
 */
export type VscodeScmActionButtonKind = 'commit' | 'publish' | 'sync' | 'conflicts'

export type VscodeScmActionButtonDisabledReason =
  | 'busy'
  | 'conflicts'
  | 'empty-message'
  | 'nothing-staged'
  | 'detached-head'

export type VscodeScmActionButton = {
  kind: VscodeScmActionButtonKind
  enabled: boolean
  disabledReason: VscodeScmActionButtonDisabledReason | null
  /** VS Code's Smart Commit: with nothing staged, the commit stages everything first. */
  stagesAllFirst: boolean
  ahead: number
  behind: number
  /** The merge/rebase/cherry-pick a commit would be completing, when one is running. */
  operation: GitConflictOperation | null
}

export type VscodeScmActionButtonInput = {
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  unresolvedConflictCount: number
  commitMessage: string
  /** VS Code's `git.enableSmartCommit`, default false there and here. */
  smartCommit: boolean
  hasBranch: boolean
  hasUpstream: boolean
  hasConfiguredPushTarget: boolean
  ahead: number
  behind: number
  conflictOperation: GitConflictOperation | null
  busy: boolean
}

function commitButton(
  input: VscodeScmActionButtonInput,
  stagesAllFirst: boolean
): VscodeScmActionButton {
  const base = {
    kind: 'commit' as const,
    stagesAllFirst,
    ahead: input.ahead,
    behind: input.behind,
    operation: input.conflictOperation
  }
  if (input.busy) {
    return { ...base, enabled: false, disabledReason: 'busy' }
  }
  if (input.commitMessage.trim().length === 0) {
    return { ...base, enabled: false, disabledReason: 'empty-message' }
  }
  return { ...base, enabled: true, disabledReason: null }
}

export function resolveVscodeScmActionButton(
  input: VscodeScmActionButtonInput
): VscodeScmActionButton {
  const shared = {
    stagesAllFirst: false,
    ahead: input.ahead,
    behind: input.behind,
    operation: input.conflictOperation
  }

  // Why first: committing over unresolved conflicts writes conflict markers into history.
  if (input.unresolvedConflictCount > 0) {
    return { ...shared, kind: 'conflicts', enabled: false, disabledReason: 'conflicts' }
  }

  const unstagedTotal = input.unstagedCount + input.untrackedCount
  if (input.stagedCount > 0) {
    return commitButton(input, false)
  }
  if (input.smartCommit && unstagedTotal > 0) {
    return commitButton(input, true)
  }
  // A merge with everything already staged still needs its commit to finish.
  if (input.conflictOperation === 'merge') {
    return commitButton(input, false)
  }

  if (input.hasBranch && !input.hasUpstream && !input.hasConfiguredPushTarget) {
    return {
      ...shared,
      kind: 'publish',
      enabled: !input.busy,
      disabledReason: input.busy ? 'busy' : null
    }
  }

  if (input.ahead > 0 || input.behind > 0) {
    return {
      ...shared,
      kind: 'sync',
      enabled: !input.busy,
      disabledReason: input.busy ? 'busy' : null
    }
  }

  return {
    ...shared,
    kind: 'commit',
    enabled: false,
    disabledReason: input.hasBranch ? 'nothing-staged' : 'detached-head'
  }
}

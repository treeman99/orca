import { isSubmoduleGitlinkRow } from '../../source-control-submodule-gitlink-row'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import { isStageableStatusEntry } from '../commit/discard-all-sequence'

/**
 * Per-row Source Control action eligibility, centralized so the stage/unstage/
 * discard gates stay consistent between the row UI, bulk selection, and tests.
 * A submodule-internal row (`submoduleRoot` set) is read-only from the parent
 * worktree: the parent repo's git can't stage/unstage/discard changes that live
 * in the submodule's own working tree, so those actions are suppressed here.
 */

export function canStageStatusEntry(entry: GitStatusEntry): boolean {
  return isStageableStatusEntry(entry)
}

export function canUnstageStatusEntry(entry: GitStatusEntry): boolean {
  return entry.area === 'staged' && !entry.submoduleRoot
}

export function canDiscardStatusEntry(entry: GitStatusEntry): boolean {
  if (entry.conflictStatus === 'unresolved' || entry.conflictStatus === 'resolved_locally') {
    return false
  }
  if (entry.area !== 'unstaged' && entry.area !== 'untracked') {
    return false
  }
  // Why still blocked: an older relay can still send these, and they name files that are
  // already committed inside the submodule — there is nothing to restore.
  if (entry.submoduleCommitRange) {
    return false
  }
  // A gitlink row is a recorded pointer, not a file. It gets its own action
  // (`git submodule update`), which the caller routes; `git restore` cannot move it.
  // Depth-independent on purpose: a gitlink nested inside an expanded submodule is one too.
  return !isSubmoduleGitlinkRow(entry)
}

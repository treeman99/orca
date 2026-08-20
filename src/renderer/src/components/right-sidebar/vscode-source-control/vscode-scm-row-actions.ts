import { isSubmoduleGitlinkRow } from '../source-control-submodule-gitlink-row'
import {
  canDiscardStatusEntry,
  canStageStatusEntry,
  canUnstageStatusEntry
} from '../source-control-entry-actions'
import type { VscodeScmRowAction } from './VscodeScmResourceRow'
import type { VscodeScmResourceGroup } from './vscode-scm-resource-groups'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'

export type VscodeScmRepositoryRole = 'parent' | 'submodule'

/**
 * True when this row's Discard means `git submodule update --init` — putting the recorded
 * pointer back — rather than restoring a file.
 *
 * Only in the PARENT section, and only when the pointer actually moved: `git submodule
 * update` does not touch the submodule's working tree, so offering it for a submodule that
 * is merely dirty inside would be a button that reports success and changes nothing.
 *
 * A gitlink nested inside a submodule section is deliberately excluded. Restoring it would
 * have to run `git submodule update` INSIDE that submodule, which the submodule-scoped API
 * cannot express, so it stays unavailable rather than silently targeting the wrong repo.
 */
export function isVscodeScmPointerRestoreRow(
  entry: GitStatusEntry,
  role: VscodeScmRepositoryRole
): boolean {
  return (
    role === 'parent' &&
    isSubmoduleGitlinkRow(entry) &&
    !entry.submoduleRoot &&
    entry.submodule?.commitChanged === true &&
    entry.area === 'unstaged' &&
    !entry.submoduleCommitRange &&
    entry.conflictStatus !== 'unresolved' &&
    entry.conflictStatus !== 'resolved_locally'
  )
}

/**
 * Which per-row buttons a section offers. The file rules come from the shared predicates
 * so this panel and the original one cannot drift; the pointer-restore row is the one case
 * they do not cover, because `canDiscardStatusEntry` deliberately refuses every gitlink.
 */
export function resolveVscodeScmRowActions(
  entry: GitStatusEntry,
  groupId: VscodeScmResourceGroup['id'],
  role: VscodeScmRepositoryRole
): VscodeScmRowAction[] {
  const actions: VscodeScmRowAction[] = []
  if (canDiscardStatusEntry(entry) || isVscodeScmPointerRestoreRow(entry, role)) {
    actions.push('discard')
  }
  if (groupId === 'index' && canUnstageStatusEntry(entry)) {
    actions.push('unstage')
  }
  if (groupId !== 'index' && canStageStatusEntry(entry)) {
    actions.push('stage')
  }
  return actions
}

import type { GitStatusEntry } from '../../../../shared/git-status-types'

/**
 * True for a row that IS a submodule pointer, at any nesting depth.
 *
 * Why not reuse `isExpandableSubmoduleEntry`: that answers "can this row be opened",
 * and it returns false once `submoduleRoot` is set — so a gitlink nested inside an
 * expanded submodule slips past it. Actions that must never treat a pointer as an
 * ordinary file (staging, discarding) need the depth-independent question, and asking
 * the expansion predicate instead is how a nested gitlink got a button that did nothing.
 *
 * Its own module so the action modules do not pull in the expansion module's tree and
 * selection dependencies.
 */
export function isSubmoduleGitlinkRow(entry: GitStatusEntry): boolean {
  return Boolean(entry.submodule)
}

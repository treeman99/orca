import type { GitStatusEntry } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'

/**
 * The sub-label that tells a submodule row apart from an ordinary edited file.
 *
 * Why this exists: `git status` annotates a gitlink with "(new commits, modified
 * content, untracked content)", and that parenthetical is what tells a user the
 * row is a pointer that moved rather than something they typed. Source Control
 * rendered a bare path, so a submodule left behind by `git checkout`/`git pull`
 * read as the user's own change. Only worktree-only rows carried a label before.
 */
export function getSubmoduleRowStateLabel(entry: GitStatusEntry): string | null {
  const submodule = entry.submodule
  if (!submodule || entry.submoduleRoot) {
    return null
  }
  const parts: string[] = []
  if (submodule.commitChanged) {
    parts.push(translate('sourceControl.submoduleNewCommits', 'new commits'))
  }
  if (submodule.trackedChanges) {
    parts.push(translate('sourceControl.submoduleModifiedContent', 'modified content'))
  }
  if (submodule.untrackedChanges) {
    parts.push(translate('sourceControl.submoduleUntrackedContent', 'untracked content'))
  }
  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * Label for a row synthesized from the parent's recorded gitlink → the
 * submodule's checked-out HEAD. These files are committed inside the submodule;
 * after a branch switch they are whatever the other branch recorded, so saying
 * so is the difference between "someone else's commit" and "my edit".
 */
export function getSubmoduleCommitRangeLabel(entry: GitStatusEntry): string | null {
  return entry.submoduleCommitRange
    ? translate('sourceControl.submoduleCommittedInSubmodule', 'committed in submodule')
    : null
}

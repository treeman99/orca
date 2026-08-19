import type { GitStatusEntry } from '../../../../shared/git-status-types'
import { translate } from '@/i18n/i18n'
import { isSubmoduleGitlinkRow } from './source-control-submodule-gitlink-row'

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
  // Why depth-independent: `git status` annotates a gitlink at any depth, so a submodule
  // nested inside an expanded one must carry the same parenthetical. Gating on
  // `submoduleRoot` silently dropped it there, and the expansion now advertises itself as
  // that folder's `git status`.
  if (!submodule || !isSubmoduleGitlinkRow(entry)) {
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

import { translate } from '@/i18n/i18n'
import type { GitConflictKind, GitStatusEntry } from '../../../../../shared/types'

/**
 * VS Code renders one status letter per row plus a decoration color. Orca's
 * porcelain-v2 entries carry richer conflict metadata than VS Code's flat
 * `Status` enum, so conflict rows resolve their letter from `conflictKind`.
 */
export type VscodeScmDecoration = {
  letter: string
  /** A `--git-decoration-*` custom property reference, ready for inline style. */
  color: string
  strikeThrough: boolean
  tooltip: string
}

const CONFLICT_LETTERS: Record<GitConflictKind, string> = {
  both_modified: 'M',
  both_added: 'A',
  both_deleted: 'D',
  added_by_us: 'A',
  added_by_them: 'A',
  deleted_by_us: 'D',
  deleted_by_them: 'D'
}

// Why resolved lazily: translate() must run per call so a language switch is picked
// up; a module-level map would freeze the first-loaded locale into every tooltip.
function conflictTooltip(kind: GitConflictKind): string {
  switch (kind) {
    case 'both_modified':
      return translate('auto.components.right.sidebar.vscodeScm.bothModified', 'Both modified')
    case 'both_added':
      return translate('auto.components.right.sidebar.vscodeScm.bothAdded', 'Both added')
    case 'both_deleted':
      return translate('auto.components.right.sidebar.vscodeScm.bothDeleted', 'Both deleted')
    case 'added_by_us':
      return translate('auto.components.right.sidebar.vscodeScm.addedByUs', 'Added by us')
    case 'added_by_them':
      return translate('auto.components.right.sidebar.vscodeScm.addedByThem', 'Added by them')
    case 'deleted_by_us':
      return translate('auto.components.right.sidebar.vscodeScm.deletedByUs', 'Deleted by us')
    case 'deleted_by_them':
      return translate('auto.components.right.sidebar.vscodeScm.deletedByThem', 'Deleted by them')
  }
}

function statusTooltip(status: GitStatusEntry['status']): string {
  switch (status) {
    case 'modified':
      return translate('auto.components.right.sidebar.vscodeScm.modified', 'Modified')
    case 'added':
      return translate('auto.components.right.sidebar.vscodeScm.added', 'Added')
    case 'deleted':
      return translate('auto.components.right.sidebar.vscodeScm.deleted', 'Deleted')
    case 'renamed':
      return translate('auto.components.right.sidebar.vscodeScm.renamed', 'Renamed')
    case 'untracked':
      return translate('auto.components.right.sidebar.vscodeScm.untracked', 'Untracked')
    case 'copied':
      return translate('auto.components.right.sidebar.vscodeScm.copied', 'Copied')
  }
}

const STATUS_DECORATION: Record<GitStatusEntry['status'], { letter: string; color: string }> = {
  modified: { letter: 'M', color: 'var(--git-decoration-modified)' },
  added: { letter: 'A', color: 'var(--git-decoration-added)' },
  deleted: { letter: 'D', color: 'var(--git-decoration-deleted)' },
  renamed: { letter: 'R', color: 'var(--git-decoration-renamed)' },
  untracked: { letter: 'U', color: 'var(--git-decoration-untracked)' },
  copied: { letter: 'C', color: 'var(--git-decoration-copied)' }
}

export function getVscodeScmDecoration(entry: GitStatusEntry): VscodeScmDecoration {
  if (entry.conflictKind && entry.conflictStatus) {
    const tooltip = conflictTooltip(entry.conflictKind)
    return {
      letter: CONFLICT_LETTERS[entry.conflictKind],
      color: 'var(--git-decoration-conflicting)',
      strikeThrough: false,
      tooltip:
        entry.conflictStatus === 'resolved_locally'
          ? `${tooltip} — ${translate('auto.components.right.sidebar.vscodeScm.resolvedLocally', 'resolved locally')}`
          : tooltip
    }
  }

  const base = STATUS_DECORATION[entry.status]
  return {
    letter: base.letter,
    color: base.color,
    // Why: VS Code strikes through deleted rows so a missing file reads as gone, not merely red.
    strikeThrough: entry.status === 'deleted',
    tooltip: statusTooltip(entry.status)
  }
}

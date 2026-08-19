import type { GitStatusEntry } from '../../../../shared/git-status-types'

/**
 * Group an expanded submodule's own `git status` into the sections that repository
 * would show on its own: staged, then changes, then untracked.
 *
 * Why grouping at all: the expansion now returns the submodule's status verbatim, so a
 * submodule with both staged and unstaged work produces a flat run of rows whose areas
 * alternate with nothing to say which is which. The parent's section headers cannot do
 * it — every one of these rows lives under whichever parent section the gitlink is in.
 *
 * Deliberately returns plain data, not nodes: the tree injector needs `SourceControlTreeNode`
 * shapes and the list injector needs raw entries, so wrapping happens at each call site.
 */
export type SubmoduleChildGroup = {
  area: GitStatusEntry['area']
  entries: GitStatusEntry[]
}

const AREA_ORDER: readonly GitStatusEntry['area'][] = ['staged', 'unstaged', 'untracked']

export function groupSubmoduleChildEntries(
  innerEntries: readonly GitStatusEntry[]
): SubmoduleChildGroup[] {
  const byArea = new Map<GitStatusEntry['area'], GitStatusEntry[]>()
  for (const entry of innerEntries) {
    // Why drop rather than render: an older relay still synthesizes rows from the parent's
    // recorded gitlink -> the submodule's HEAD. Those files are committed inside the
    // submodule, so a status view that claims to mirror `git status` must not carry them —
    // and the label that used to explain them is gone.
    if (entry.submoduleCommitRange) {
      continue
    }
    const existing = byArea.get(entry.area)
    if (existing) {
      existing.push(entry)
    } else {
      byArea.set(entry.area, [entry])
    }
  }
  const groups: SubmoduleChildGroup[] = []
  for (const area of AREA_ORDER) {
    const entries = byArea.get(area)
    if (entries && entries.length > 0) {
      groups.push({ area, entries })
    }
  }
  return groups
}

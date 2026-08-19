import type { GitStatusEntry } from '../../../../../shared/types'

/** VS Code's four SCM resource groups, in the order its Source Control view renders them. */
export type VscodeScmGroupId = 'merge' | 'index' | 'workingTree' | 'untracked'

/** Mirrors VS Code's `git.untrackedChanges`. `mixed` is its default. */
export type VscodeScmUntrackedPolicy = 'mixed' | 'separate' | 'hidden'

export type VscodeScmResourceGroup = {
  id: VscodeScmGroupId
  entries: GitStatusEntry[]
  /** VS Code sets this on `merge` and `untracked` only. */
  hideWhenEmpty: boolean
}

const GROUP_ORDER: VscodeScmGroupId[] = ['merge', 'index', 'workingTree', 'untracked']
const HIDE_WHEN_EMPTY: ReadonlySet<VscodeScmGroupId> = new Set<VscodeScmGroupId>([
  'merge',
  'untracked'
])

/** Conflicts outrank their staging area: git reports them as unstaged `u` records. */
export function isMergeGroupEntry(entry: GitStatusEntry): boolean {
  return entry.conflictStatus !== undefined
}

function comparePath(a: GitStatusEntry, b: GitStatusEntry): number {
  return a.path.localeCompare(b.path)
}

export function buildVscodeScmResourceGroups(
  entries: readonly GitStatusEntry[],
  untrackedPolicy: VscodeScmUntrackedPolicy = 'mixed'
): VscodeScmResourceGroup[] {
  const buckets: Record<VscodeScmGroupId, GitStatusEntry[]> = {
    merge: [],
    index: [],
    workingTree: [],
    untracked: []
  }

  for (const entry of entries) {
    if (isMergeGroupEntry(entry)) {
      buckets.merge.push(entry)
      continue
    }
    if (entry.area === 'staged') {
      buckets.index.push(entry)
      continue
    }
    if (entry.area === 'untracked') {
      if (untrackedPolicy === 'hidden') {
        continue
      }
      buckets[untrackedPolicy === 'separate' ? 'untracked' : 'workingTree'].push(entry)
      continue
    }
    buckets.workingTree.push(entry)
  }

  return GROUP_ORDER.map((id) => ({
    id,
    entries: buckets[id].sort(comparePath),
    hideWhenEmpty: HIDE_WHEN_EMPTY.has(id)
  }))
}

export function getVisibleVscodeScmGroups(
  groups: readonly VscodeScmResourceGroup[]
): VscodeScmResourceGroup[] {
  return groups.filter((group) => !group.hideWhenEmpty || group.entries.length > 0)
}

export function countVscodeScmChanges(groups: readonly VscodeScmResourceGroup[]): number {
  return groups.reduce((total, group) => total + group.entries.length, 0)
}

/**
 * The two fields the merge keys on. Kept structural so the relay, whose status
 * rows are carried as plain records over JSON-RPC, can reuse this unchanged.
 */
type SubmoduleMergeableEntry = { path?: unknown; area?: unknown }

/**
 * Merge the commit-range rows of an expanded submodule with its working-tree
 * rows. Shared by the main process and the relay so local and SSH expansion
 * agree.
 *
 * When a submodule sits on its own branch its gitlink almost always points at a
 * different commit than the checkout, so the range rows overlap the working-tree
 * rows for exactly the files the user is editing. Working-tree rows therefore
 * win: they are the uncommitted, actionable changes, and dropping them is what
 * made a submodule's edits look missing.
 *
 * Overlap is keyed by `area::path`, not by path alone. Range rows are always
 * reported in the `unstaged` area, so a path-only key let an unstaged range row
 * evict the *staged* working row for the same file.
 */
export function mergeSubmoduleRangeWithWorkingEntries<T extends SubmoduleMergeableEntry>(
  rangeEntries: readonly T[],
  workingEntries: readonly T[]
): T[] {
  const workingKeys = new Set(workingEntries.map(getSubmoduleEntryKey))
  return [
    ...rangeEntries.filter((entry) => !workingKeys.has(getSubmoduleEntryKey(entry))),
    ...workingEntries
  ]
}

function getSubmoduleEntryKey(entry: SubmoduleMergeableEntry): string {
  return `${String(entry.area)}::${String(entry.path)}`
}

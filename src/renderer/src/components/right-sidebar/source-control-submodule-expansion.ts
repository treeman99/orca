import type { GitStatusEntry } from '../../../../shared/types'
import { basename } from '@/lib/path'
import type { SourceControlSectionArea } from './source-control-section-order'
import type { SourceControlTreeNode } from './source-control-tree'
import type { FlatEntry } from './useSourceControlSelection'

export type SubmoduleSectionTreeNode = SourceControlTreeNode<
  GitStatusEntry,
  SourceControlSectionArea
>

/**
 * Loading/empty/error placeholder shown beneath an expanded submodule while its
 * inner status is fetched on demand. Kept separate from real tree nodes so it
 * never leaks into selection or bulk path collection.
 */
export type SubmodulePlaceholderNode = {
  type: 'submodule-placeholder'
  key: string
  submodulePath: string
  depth: number
  state: 'loading' | 'empty' | 'error' | 'truncated'
  message?: string
}

export type RenderableSourceControlNode = SubmoduleSectionTreeNode | SubmodulePlaceholderNode

export type SubmoduleStatusState =
  | { status: 'loading' }
  | {
      status: 'loaded'
      entries: GitStatusEntry[]
      didHitLimit?: boolean
      // The submodule's OWN branch/HEAD, read from the same inner `git status`
      // that produced `entries`. A submodule commonly sits on a different branch
      // than the parent, so this is what distinguishes it as its own repository.
      branch?: string
      head?: string
    }
  | { status: 'error'; error: string }

export function getSubmoduleExpansionKey(entry: Pick<GitStatusEntry, 'area' | 'path'>): string {
  return `${entry.area}::${entry.path}`
}

export function parseSubmoduleExpansionKey(
  key: string
): { area: GitStatusEntry['area']; path: string } | null {
  const separatorIndex = key.indexOf('::')
  if (separatorIndex <= 0) {
    return null
  }
  const area = key.slice(0, separatorIndex)
  if (area !== 'staged' && area !== 'unstaged' && area !== 'untracked') {
    return null
  }
  const path = key.slice(separatorIndex + 2)
  return path ? { area, path } : null
}

/**
 * A changed submodule row opens to that submodule's own `git status`.
 *
 * `commitChanged` still counts even though a moved pointer produces no status rows on its
 * own: the branch label beside the row is fetched by this same predicate, and a submodule
 * parked on its own branch with a clean worktree is exactly the case where "which branch is
 * this on" is the only thing worth showing. It opens to an explained empty list.
 *
 * A staged gitlink row does not open. Its expansion would be the same submodule status the
 * unstaged row already shows, and staging a gitlink records a pointer, not file contents —
 * the same reason the parent cannot stage anything inside a submodule.
 */
export function isExpandableSubmoduleEntry(entry: GitStatusEntry): boolean {
  const submodule = entry.submodule
  if (!submodule || entry.submoduleRoot || entry.area === 'staged') {
    return false
  }
  return submodule.commitChanged || submodule.trackedChanges || submodule.untrackedChanges
}

/**
 * Build the read-only inner entry for a submodule child row. The inner path is
 * relative to the submodule root, so it is prefixed with the submodule path
 * (drives diff routing) and stamped with `submoduleRoot` (drives read-only
 * gating).
 *
 * The child keeps its OWN area. It used to be overwritten by the parent gitlink's when that
 * was staged, back when a staged expansion meant a HEAD->index range; the expansion is now
 * the submodule's own status, where a row's area is a fact about the submodule's index and
 * relabelling it would make the panel disagree with `git status` in that folder.
 */
export function buildSubmoduleChildEntry(
  submodulePath: string,
  innerEntry: GitStatusEntry
): GitStatusEntry {
  return {
    ...innerEntry,
    path: `${submodulePath}/${innerEntry.path}`,
    ...(innerEntry.oldPath ? { oldPath: `${submodulePath}/${innerEntry.oldPath}` } : {}),
    submoduleRoot: submodulePath
  }
}

/**
 * Build the child file rows for an expanded submodule (tree view).
 */
export function buildSubmoduleChildNodes(
  parent: SubmoduleSectionTreeNode & { type: 'file' },
  innerEntries: GitStatusEntry[]
): (SubmoduleSectionTreeNode & { type: 'file' })[] {
  const submodulePath = parent.entry.path
  return innerEntries.map((innerEntry) => {
    const childEntry = buildSubmoduleChildEntry(submodulePath, innerEntry)
    return {
      type: 'file',
      key: `${childEntry.area}::${childEntry.path}`,
      name: basename(childEntry.path),
      path: childEntry.path,
      entry: childEntry,
      area: childEntry.area,
      depth: parent.depth + 1
    }
  })
}

/**
 * Flat-list (non-tree) variant of an expanded source-control row: either a real
 * status entry or a submodule placeholder. Used by the list view, which renders
 * raw entries instead of tree nodes.
 */
export type RenderableSubmoduleListItem =
  | { type: 'entry'; entry: GitStatusEntry }
  | SubmodulePlaceholderNode

/**
 * Splice lazily-loaded submodule children into a flat list of status entries
 * (list view). Mirrors injectExpandedSubmoduleRows but operates on entries.
 */
export function injectExpandedSubmoduleEntries(
  entries: readonly GitStatusEntry[],
  expandedSubmoduleKeys: ReadonlySet<string>,
  submoduleStatusByKey: Readonly<Record<string, SubmoduleStatusState>>,
  loadingMessage: string,
  emptyMessage: string
): RenderableSubmoduleListItem[] {
  const result: RenderableSubmoduleListItem[] = []
  for (const entry of entries) {
    result.push({ type: 'entry', entry })
    const expansionKey = getSubmoduleExpansionKey(entry)
    if (!isExpandableSubmoduleEntry(entry) || !expandedSubmoduleKeys.has(expansionKey)) {
      continue
    }
    const submodulePath = entry.path
    const state = submoduleStatusByKey[expansionKey]
    if (!state || state.status === 'loading') {
      result.push({
        type: 'submodule-placeholder',
        key: `submodule-loading::${entry.area}::${submodulePath}`,
        submodulePath,
        depth: 1,
        state: 'loading',
        message: loadingMessage
      })
      continue
    }
    if (state.status === 'error') {
      result.push({
        type: 'submodule-placeholder',
        key: `submodule-error::${entry.area}::${submodulePath}`,
        submodulePath,
        depth: 1,
        state: 'error',
        message: state.error
      })
      continue
    }
    if (state.entries.length === 0) {
      result.push({
        type: 'submodule-placeholder',
        key: `submodule-empty::${entry.area}::${submodulePath}`,
        submodulePath,
        depth: 1,
        state: 'empty',
        message: emptyMessage
      })
      continue
    }
    for (const innerEntry of state.entries) {
      result.push({
        type: 'entry',
        entry: buildSubmoduleChildEntry(submodulePath, innerEntry)
      })
    }
    if (state.didHitLimit) {
      result.push({
        type: 'submodule-placeholder',
        key: `submodule-truncated::${entry.area}::${submodulePath}`,
        submodulePath,
        depth: 1,
        state: 'truncated'
      })
    }
  }
  return result
}

/**
 * Map injected list rows to selection entries. List-view selection/range/open-key
 * bookkeeping must read the same submodule-injected rows it renders; otherwise an
 * expanded submodule's child files render with handlers but stay unselectable.
 * Placeholders are skipped because they are not selectable.
 */
export function collectListSelectionEntries(
  rows: readonly RenderableSubmoduleListItem[]
): FlatEntry[] {
  const result: FlatEntry[] = []
  for (const row of rows) {
    if (row.type === 'entry') {
      result.push({
        key: `${row.entry.area}::${row.entry.path}`,
        entry: row.entry,
        area: row.entry.area
      })
    }
  }
  return result
}

/**
 * Splice lazily-loaded submodule children into a flattened tree row list. Only
 * expanded submodules are touched; everything else passes through untouched so
 * the status poll stays free of submodule recursion.
 */
export function injectExpandedSubmoduleRows(
  nodes: SubmoduleSectionTreeNode[],
  expandedSubmoduleKeys: ReadonlySet<string>,
  submoduleStatusByKey: Readonly<Record<string, SubmoduleStatusState>>,
  loadingMessage: string,
  emptyMessage: string
): RenderableSourceControlNode[] {
  const result: RenderableSourceControlNode[] = []
  for (const node of nodes) {
    result.push(node)
    if (
      node.type !== 'file' ||
      !isExpandableSubmoduleEntry(node.entry) ||
      !expandedSubmoduleKeys.has(getSubmoduleExpansionKey(node.entry))
    ) {
      continue
    }
    const submodulePath = node.entry.path
    const state = submoduleStatusByKey[getSubmoduleExpansionKey(node.entry)]
    if (!state || state.status === 'loading') {
      result.push({
        type: 'submodule-placeholder',
        key: `submodule-loading::${node.area}::${submodulePath}`,
        submodulePath,
        depth: node.depth + 1,
        state: 'loading',
        message: loadingMessage
      })
      continue
    }
    if (state.status === 'error') {
      result.push({
        type: 'submodule-placeholder',
        key: `submodule-error::${node.area}::${submodulePath}`,
        submodulePath,
        depth: node.depth + 1,
        state: 'error',
        message: state.error
      })
      continue
    }
    if (state.entries.length === 0) {
      result.push({
        type: 'submodule-placeholder',
        key: `submodule-empty::${node.area}::${submodulePath}`,
        submodulePath,
        depth: node.depth + 1,
        state: 'empty',
        message: emptyMessage
      })
      continue
    }
    for (const childNode of buildSubmoduleChildNodes(node, state.entries)) {
      result.push(childNode)
    }
    if (state.didHitLimit) {
      result.push({
        type: 'submodule-placeholder',
        key: `submodule-truncated::${node.area}::${submodulePath}`,
        submodulePath,
        depth: node.depth + 1,
        state: 'truncated'
      })
    }
  }
  return result
}

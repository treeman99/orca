import type { GitStatusEntry } from '../../../../../shared/git-status-types'

/**
 * Row model behind VS Code's `scm.defaultViewMode` list/tree switch. The tree
 * compresses single-child directory chains the way VS Code's compressible tree
 * does, so `src/main/git` renders as one row instead of three.
 */
export type VscodeScmRow =
  | { kind: 'directory'; key: string; label: string; depth: number; fileCount: number }
  | { kind: 'file'; key: string; entry: GitStatusEntry; depth: number }

type MutableDir = {
  name: string
  dirs: Map<string, MutableDir>
  files: GitStatusEntry[]
}

function makeDir(name: string): MutableDir {
  return { name, dirs: new Map(), files: [] }
}

function rowKeyForEntry(entry: GitStatusEntry): string {
  return `${entry.area}:${entry.path}`
}

export function buildVscodeScmListRows(entries: readonly GitStatusEntry[]): VscodeScmRow[] {
  return entries.map((entry) => ({
    kind: 'file' as const,
    key: rowKeyForEntry(entry),
    entry,
    depth: 0
  }))
}

function insertEntry(root: MutableDir, entry: GitStatusEntry): void {
  const segments = entry.path.split('/').filter((segment) => segment.length > 0)
  if (segments.length === 0) {
    return
  }
  let node = root
  for (const segment of segments.slice(0, -1)) {
    let next = node.dirs.get(segment)
    if (!next) {
      next = makeDir(segment)
      node.dirs.set(segment, next)
    }
    node = next
  }
  node.files.push(entry)
}

function countFiles(node: MutableDir): number {
  let total = node.files.length
  for (const child of node.dirs.values()) {
    total += countFiles(child)
  }
  return total
}

/** Collapses `a` → `a/b` → `a/b/c` into one labeled row, as VS Code's tree does. */
function compress(node: MutableDir): { labelSegments: string[]; tail: MutableDir } {
  const labelSegments = [node.name]
  let tail = node
  while (tail.files.length === 0 && tail.dirs.size === 1) {
    const [only] = tail.dirs.values()
    labelSegments.push(only.name)
    tail = only
  }
  return { labelSegments, tail }
}

function emitRows(
  node: MutableDir,
  prefix: string,
  depth: number,
  collapsedDirectoryKeys: ReadonlySet<string>,
  out: VscodeScmRow[]
): void {
  const directoryNames = [...node.dirs.keys()].sort((a, b) => a.localeCompare(b))
  for (const name of directoryNames) {
    const child = node.dirs.get(name)
    if (!child) {
      continue
    }
    const { labelSegments, tail } = compress(child)
    const label = labelSegments.join('/')
    const key = prefix ? `${prefix}/${label}` : label
    out.push({ kind: 'directory', key, label, depth, fileCount: countFiles(tail) })
    if (!collapsedDirectoryKeys.has(key)) {
      emitRows(tail, key, depth + 1, collapsedDirectoryKeys, out)
    }
  }

  const files = [...node.files].sort((a, b) => a.path.localeCompare(b.path))
  for (const entry of files) {
    out.push({ kind: 'file', key: rowKeyForEntry(entry), entry, depth })
  }
}

export function buildVscodeScmTreeRows(
  entries: readonly GitStatusEntry[],
  collapsedDirectoryKeys: ReadonlySet<string> = new Set()
): VscodeScmRow[] {
  const root = makeDir('')
  for (const entry of entries) {
    insertEntry(root, entry)
  }
  const rows: VscodeScmRow[] = []
  emitRows(root, '', 0, collapsedDirectoryKeys, rows)
  return rows
}

export function buildVscodeScmRows(
  entries: readonly GitStatusEntry[],
  viewMode: 'list' | 'tree',
  collapsedDirectoryKeys: ReadonlySet<string> = new Set()
): VscodeScmRow[] {
  return viewMode === 'tree'
    ? buildVscodeScmTreeRows(entries, collapsedDirectoryKeys)
    : buildVscodeScmListRows(entries)
}

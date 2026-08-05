import type { GitStatusEntry } from '../../../../shared/types'

/**
 * Split an expanded submodule child row into the two paths a discard needs: the
 * submodule to run inside, and the file relative to THAT repository.
 *
 * Why the split matters: the row's `path` is parent-relative (`vendor/sub/a.txt`) because
 * that is what opens the file in the editor, but git has to be told `a.txt` with the
 * submodule as its working directory. Handing the parent-relative path to a discard that
 * runs in the submodule silently targets the wrong file — or, when the submodule is not a
 * repository at that moment, targets the PARENT's copy of it.
 */
export type SubmoduleDiscardTarget = {
  /** Submodule root, relative to the parent worktree. */
  submodulePath: string
  /** File to discard, relative to the submodule root. */
  innerPath: string
}

// Why segment-wise and not a `startsWith('.')` check: `a/../../root.txt` starts with a
// normal segment and would pass, then escape two levels once git resolves it.
function hasTraversalSegment(path: string): boolean {
  return path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
}

/** The discard target for a submodule child row, or null when the row is not one. */
export function resolveSubmoduleDiscardTarget(
  entry: GitStatusEntry
): SubmoduleDiscardTarget | null {
  const submodulePath = entry.submoduleRoot
  if (!submodulePath || hasTraversalSegment(submodulePath)) {
    return null
  }
  const prefix = `${submodulePath}/`
  if (!entry.path.startsWith(prefix)) {
    return null
  }
  const innerPath = entry.path.slice(prefix.length)
  if (!innerPath || hasTraversalSegment(innerPath)) {
    return null
  }
  return { submodulePath, innerPath }
}

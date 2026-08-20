import { resolveSubmoduleDiscardTarget } from '../source-control-submodule-discard-target'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'

/**
 * Validate a row inside a submodule section before its path reaches that submodule's git.
 *
 * Inside its own section a row's `path` is ALREADY submodule-relative, so there is nothing
 * to strip — but it still has to be proved safe, because `.gitmodules` and a status reply
 * are both repo-controlled content and this path becomes an argument to a write. Rather
 * than a second copy of the segment rules, ask the existing validator the same question by
 * handing it the parent-relative spelling it expects.
 *
 * Returns the submodule-relative path, or null when either half is untrustworthy.
 */
export function resolveVscodeScmSubmoduleInnerPath(
  submodulePath: string,
  entry: Pick<GitStatusEntry, 'path'>
): string | null {
  const target = resolveSubmoduleDiscardTarget({
    status: 'modified',
    area: 'unstaged',
    ...entry,
    path: `${submodulePath}/${entry.path}`,
    submoduleRoot: submodulePath
  } as GitStatusEntry)
  return target?.innerPath ?? null
}

/** The same check for a whole selection; a single bad path drops the whole batch. */
export function resolveVscodeScmSubmoduleInnerPaths(
  submodulePath: string,
  paths: readonly string[]
): string[] | null {
  const inner: string[] = []
  for (const path of paths) {
    const resolved = resolveVscodeScmSubmoduleInnerPath(submodulePath, { path })
    if (!resolved) {
      return null
    }
    inner.push(resolved)
  }
  return inner
}

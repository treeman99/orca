/**
 * Re-applies the repo's / user's configured `submodule.<name>.ignore` (and the
 * `diff.ignoreSubmodules` default) to gitlink rows after Source Control polls
 * with `--ignore-submodules=none`.
 *
 * Why both: the override in git-status-command-args.ts exists so a checked-in
 * `.gitmodules` cannot blank the gitlink row on every clone. But it also made
 * Orca report rows the user's own `git status` hides — most visibly the pointer
 * drift `git checkout`/`git pull` leave behind, which nobody edited. Polling
 * with the override and narrowing afterwards keeps the raw sub-state available
 * (the `SCMU` markers are what make a row expandable) while honouring intent.
 *
 * ONE deliberate deviation from Git: a submodule carrying *tracked* working-tree
 * modifications is always reported, even under `ignore = dirty`/`all`. Hiding
 * uncommitted edits in an IDE risks losing them, and that invisibility is the
 * regression the override was added to fix.
 *
 * Baseline: `git config --get-regexp` and `--file` long predate Git 2.25, so no
 * capability probe is required (see docs/reference/git-compatibility.md).
 */
import type { GitSubmoduleStatus } from './git-status-types'

export type SubmoduleIgnoreMode = 'none' | 'untracked' | 'dirty' | 'all'

/**
 * `.gitmodules` carries both the path (name -> path mapping) and the checked-in
 * `ignore`, so one read covers both. Read with `--file` rather than the config
 * chain because `.gitmodules` is a worktree file, not repo config.
 */
export const SUBMODULE_IGNORE_GITMODULES_ARGS: readonly string[] = [
  'config',
  '--file',
  '.gitmodules',
  '--get-regexp',
  '^submodule\\..*\\.(path|ignore)$'
]

/**
 * The standard config chain (system/global/local/worktree). `diff.ignoresubmodules`
 * is lowercased because `--get-regexp` matches the canonical key.
 */
export const SUBMODULE_IGNORE_LOCAL_CONFIG_ARGS: readonly string[] = [
  'config',
  '--get-regexp',
  '^(submodule\\..*\\.ignore|diff\\.ignoresubmodules)$'
]

export type SubmoduleIgnorePolicy = {
  /** Submodule path (forward-slash, no trailing slash) -> effective mode. */
  byPath: ReadonlyMap<string, SubmoduleIgnoreMode>
  /** `diff.ignoreSubmodules`, used for gitlinks with no key of their own. */
  fallback: SubmoduleIgnoreMode
}

export const INERT_SUBMODULE_IGNORE_POLICY: SubmoduleIgnorePolicy = {
  byPath: new Map(),
  fallback: 'none'
}

/** True when the policy cannot change any row, so callers can skip the walk. */
export function isSubmoduleIgnorePolicyInert(policy: SubmoduleIgnorePolicy): boolean {
  if (policy.fallback !== 'none') {
    return false
  }
  for (const mode of policy.byPath.values()) {
    if (mode !== 'none') {
      return false
    }
  }
  return true
}

function parseIgnoreMode(value: string): SubmoduleIgnoreMode | null {
  const normalized = value.trim().toLowerCase()
  return normalized === 'none' ||
    normalized === 'untracked' ||
    normalized === 'dirty' ||
    normalized === 'all'
    ? normalized
    : null
}

function normalizeSubmodulePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * Split one `git config --get-regexp` line into key and value. The subsection
 * (`<name>`) keeps its case and may contain dots and slashes, so the key is cut
 * at the LAST dot, never the first.
 */
function parseConfigLine(line: string): { key: string; value: string } | null {
  const spaceIndex = line.indexOf(' ')
  if (spaceIndex <= 0) {
    return null
  }
  return { key: line.slice(0, spaceIndex), value: line.slice(spaceIndex + 1) }
}

function parseSubmoduleSubsection(key: string): { name: string; leaf: string } | null {
  if (!key.startsWith('submodule.')) {
    return null
  }
  const lastDot = key.lastIndexOf('.')
  if (lastDot <= 'submodule.'.length - 1) {
    return null
  }
  const name = key.slice('submodule.'.length, lastDot)
  return name ? { name, leaf: key.slice(lastDot + 1) } : null
}

/**
 * Resolve the effective mode per submodule path from the two config reads.
 * Precedence matches Git: repo config beats `.gitmodules`, which beats
 * `diff.ignoreSubmodules`.
 */
export function buildSubmoduleIgnorePolicy(
  gitmodulesConfig: string,
  localConfig: string
): SubmoduleIgnorePolicy {
  const pathByName = new Map<string, string>()
  const gitmodulesIgnoreByName = new Map<string, SubmoduleIgnoreMode>()
  for (const line of gitmodulesConfig.split(/\r?\n/)) {
    const parsed = line ? parseConfigLine(line) : null
    const subsection = parsed ? parseSubmoduleSubsection(parsed.key) : null
    if (!parsed || !subsection) {
      continue
    }
    if (subsection.leaf === 'path') {
      pathByName.set(subsection.name, normalizeSubmodulePath(parsed.value.trim()))
    } else if (subsection.leaf === 'ignore') {
      const mode = parseIgnoreMode(parsed.value)
      if (mode) {
        gitmodulesIgnoreByName.set(subsection.name, mode)
      }
    }
  }

  const localIgnoreByName = new Map<string, SubmoduleIgnoreMode>()
  let fallback: SubmoduleIgnoreMode = 'none'
  for (const line of localConfig.split(/\r?\n/)) {
    const parsed = line ? parseConfigLine(line) : null
    if (!parsed) {
      continue
    }
    if (parsed.key === 'diff.ignoresubmodules') {
      // Why last-wins: `--get-regexp` prints the chain in precedence order, so
      // the most specific file (local, then worktree) is printed last.
      fallback = parseIgnoreMode(parsed.value) ?? fallback
      continue
    }
    const subsection = parseSubmoduleSubsection(parsed.key)
    if (subsection?.leaf === 'ignore') {
      const mode = parseIgnoreMode(parsed.value)
      if (mode) {
        localIgnoreByName.set(subsection.name, mode)
      }
    }
  }

  const byPath = new Map<string, SubmoduleIgnoreMode>()
  for (const [name, submodulePath] of pathByName) {
    if (!submodulePath) {
      continue
    }
    const mode = localIgnoreByName.get(name) ?? gitmodulesIgnoreByName.get(name)
    if (mode) {
      byPath.set(submodulePath, mode)
    }
  }
  // A name whose path is only known from repo config still deserves its key; the
  // name defaults to the path for every submodule `git submodule add` creates.
  for (const [name, mode] of localIgnoreByName) {
    const normalized = normalizeSubmodulePath(name)
    if (!byPath.has(normalized) && !pathByName.has(name)) {
      byPath.set(normalized, mode)
    }
  }
  return { byPath, fallback }
}

/**
 * The two fields the narrowing reads. Kept structural so the relay, whose status
 * rows are carried as plain records over JSON-RPC, can reuse this unchanged.
 */
type IgnorePolicyApplicableEntry = { path?: unknown; submodule?: unknown }

function readSubmoduleState(value: unknown): GitSubmoduleStatus | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const state = value as Partial<GitSubmoduleStatus>
  return typeof state.commitChanged === 'boolean' &&
    typeof state.trackedChanges === 'boolean' &&
    typeof state.untrackedChanges === 'boolean'
    ? (state as GitSubmoduleStatus)
    : null
}

/**
 * Narrow one parsed status row to what the configured `ignore` allows, or drop
 * it entirely. Non-gitlink rows pass through untouched.
 */
export function applySubmoduleIgnorePolicy<T extends IgnorePolicyApplicableEntry>(
  entry: T,
  policy: SubmoduleIgnorePolicy
): T | null {
  const submodule = readSubmoduleState(entry.submodule)
  if (!submodule) {
    return entry
  }
  const mode = policy.byPath.get(normalizeSubmodulePath(String(entry.path))) ?? policy.fallback
  if (mode === 'none') {
    return entry
  }
  // `all` is the only mode that hides the commit pointer; `untracked`/`dirty`
  // both still report it, exactly as Git does.
  const commitChanged = mode === 'all' ? false : submodule.commitChanged
  // The deviation documented at the top of this file: never hide tracked dirt.
  const trackedChanges = submodule.trackedChanges
  // Every non-`none` mode ignores untracked content inside the submodule.
  const untrackedChanges = false
  if (!commitChanged && !trackedChanges && !untrackedChanges) {
    return null
  }
  if (
    commitChanged === submodule.commitChanged &&
    untrackedChanges === submodule.untrackedChanges
  ) {
    return entry
  }
  return { ...entry, submodule: { commitChanged, trackedChanges, untrackedChanges } }
}

/** Apply the policy across a row list, dropping fully-ignored gitlinks. */
export function applySubmoduleIgnorePolicyToEntries<T extends IgnorePolicyApplicableEntry>(
  entries: readonly T[],
  policy: SubmoduleIgnorePolicy
): T[] {
  if (isSubmoduleIgnorePolicyInert(policy)) {
    return [...entries]
  }
  const result: T[] = []
  for (const entry of entries) {
    const narrowed = applySubmoduleIgnorePolicy(entry, policy)
    if (narrowed) {
      result.push(narrowed)
    }
  }
  return result
}

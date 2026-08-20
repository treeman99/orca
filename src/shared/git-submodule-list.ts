/**
 * Submodule inventory read from `.gitmodules`, shared by the main process and the
 * relay so a local workspace and an SSH one enumerate the same submodules.
 *
 * The cap mirrors VS Code's `git.detectSubmodulesLimit` default: a repo with a
 * hundred submodules would otherwise turn one Source Control poll into a hundred
 * status reads.
 */
export const MAX_DETECTED_SUBMODULES = 10

export type GitSubmoduleConfigEntry = {
  /** The `<name>` in `submodule.<name>.path`. Not necessarily the path. */
  name: string
  /** Relative to the parent worktree, forward-slash, no trailing slash. */
  path: string
}

export type GitSubmoduleSummary = GitSubmoduleConfigEntry & {
  /** `.git` exists at the path; an uninitialized submodule has no status to read. */
  initialized: boolean
}

export type GitSubmoduleListResult = {
  submodules: GitSubmoduleSummary[]
  didHitLimit: boolean
}

// Why greedy before `.path`: a submodule name may itself contain dots
// (`submodule.vendor/lib.js.path`), so the LAST `.path ` is the separator.
const SUBMODULE_PATH_KEY = /^submodule\.(.*)\.path (.*)$/

/** Parse `git config --file .gitmodules --get-regexp '^submodule\..*\.path$'` output. */
export function parseSubmoduleConfigOutput(stdout: string): GitSubmoduleConfigEntry[] {
  const entries: GitSubmoduleConfigEntry[] = []
  const seen = new Set<string>()
  for (const line of stdout.split(/\r?\n/)) {
    const match = SUBMODULE_PATH_KEY.exec(line.trim())
    if (!match) {
      continue
    }
    const name = match[1].trim()
    const submodulePath = normalizeSubmoduleConfigPath(match[2])
    if (!name || !submodulePath || seen.has(submodulePath)) {
      continue
    }
    seen.add(submodulePath)
    entries.push({ name, path: submodulePath })
  }
  return entries
}

export function normalizeSubmoduleConfigPath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Apply {@link MAX_DETECTED_SUBMODULES}, reporting whether anything was dropped. */
export function limitDetectedSubmodules<T>(entries: readonly T[]): {
  entries: T[]
  didHitLimit: boolean
} {
  return entries.length > MAX_DETECTED_SUBMODULES
    ? { entries: entries.slice(0, MAX_DETECTED_SUBMODULES), didHitLimit: true }
    : { entries: [...entries], didHitLimit: false }
}

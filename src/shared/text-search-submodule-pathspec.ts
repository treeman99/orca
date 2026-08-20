/**
 * Translate the search panel's include/exclude globs from parent-worktree
 * coordinates into a submodule's own coordinates.
 *
 * Why this exists: the git-grep fallback searches a submodule by running git a
 * second time with the submodule root as cwd, so pathspecs written against the
 * parent root would silently mean something else there. Rather than guess, a
 * glob that has no exact submodule-relative equivalent makes the caller skip
 * that submodule and say so — a wrong result set is worse than a missing one.
 */
import { splitSearchGlobPatterns } from './text-search'

/** Result of translating one glob into a submodule's coordinates. */
type TranslatedGlob =
  /** Provably cannot match anything inside the submodule. */
  | { kind: 'unrelated' }
  /** Exact submodule-relative equivalent. */
  | { kind: 'glob'; glob: string }
  /** No exact equivalent; the caller must degrade rather than guess. */
  | { kind: 'untranslatable' }

export type SubmoduleSearchPatterns =
  | { kind: 'search'; includePattern?: string; excludePattern?: string }
  /** `degraded` distinguishes "user asked for nothing here" from "we gave up". */
  | { kind: 'skip'; degraded: boolean }

const GLOB_METACHARACTERS = /[*?[\]{}\\]/

/**
 * Walk the glob's leading segments against the submodule's own path. A literal
 * segment that differs proves the glob can never reach inside the submodule; a
 * segment carrying wildcards ends the analysis because only a glob engine could
 * settle it.
 */
function comparePrefixSegments(glob: string, submodulePath: string): 'unrelated' | 'undecided' {
  const globSegments = glob.split('/')
  const submoduleSegments = submodulePath.split('/')
  const depth = Math.min(globSegments.length, submoduleSegments.length)
  for (let i = 0; i < depth; i++) {
    if (globSegments[i] === submoduleSegments[i]) {
      continue
    }
    if (!GLOB_METACHARACTERS.test(globSegments[i])) {
      return 'unrelated'
    }
    return 'undecided'
  }
  return 'undecided'
}

function translateGlob(glob: string, submodulePath: string): TranslatedGlob {
  // A bare pattern is recursive by convention (toGitGlobPathspec prepends `**/`),
  // so it means the same thing at any root.
  if (!glob.includes('/')) {
    return { kind: 'glob', glob }
  }
  // Already depth-agnostic — identical meaning under either root.
  if (glob.startsWith('**/')) {
    return { kind: 'glob', glob }
  }
  const prefix = `${submodulePath}/`
  if (glob.startsWith(prefix)) {
    const rest = glob.slice(prefix.length)
    return rest ? { kind: 'glob', glob: rest } : { kind: 'untranslatable' }
  }
  if (comparePrefixSegments(glob, submodulePath) === 'unrelated') {
    return { kind: 'unrelated' }
  }
  return { kind: 'untranslatable' }
}

function translateAll(
  patterns: string,
  submodulePath: string
): { globs: string[]; unrelated: number; untranslatable: boolean } {
  const globs: string[] = []
  let unrelated = 0
  for (const glob of splitSearchGlobPatterns(patterns)) {
    const translated = translateGlob(glob, submodulePath)
    if (translated.kind === 'untranslatable') {
      return { globs: [], unrelated: 0, untranslatable: true }
    }
    if (translated.kind === 'unrelated') {
      unrelated++
      continue
    }
    globs.push(translated.glob)
  }
  return { globs, unrelated, untranslatable: false }
}

// Why re-join with ',': splitSearchGlobPatterns is the inverse and escapes are
// already normalized by it, so a translated list round-trips through the same builder.
function joinPatterns(globs: string[]): string | undefined {
  return globs.length > 0 ? globs.join(',') : undefined
}

/**
 * Decide how (or whether) to run the fallback search inside `submodulePath`.
 *
 * `{ kind: 'skip', degraded: false }` means the user's filters exclude the whole
 * submodule by construction; `degraded: true` means a glob had no equivalent and
 * the submodule is being left unsearched, which the caller must surface.
 */
export function translateSearchPatternsIntoSubmodule(
  opts: { includePattern?: string; excludePattern?: string },
  submodulePath: string
): SubmoduleSearchPatterns {
  const result: { kind: 'search'; includePattern?: string; excludePattern?: string } = {
    kind: 'search'
  }
  if (opts.includePattern) {
    const { globs, unrelated, untranslatable } = translateAll(opts.includePattern, submodulePath)
    if (untranslatable) {
      return { kind: 'skip', degraded: true }
    }
    // Every include glob points somewhere else: nothing here was ever requested.
    if (globs.length === 0 && unrelated > 0) {
      return { kind: 'skip', degraded: false }
    }
    result.includePattern = joinPatterns(globs)
  }
  if (opts.excludePattern) {
    const { globs, untranslatable } = translateAll(opts.excludePattern, submodulePath)
    if (untranslatable) {
      return { kind: 'skip', degraded: true }
    }
    // Dropping an 'unrelated' exclusion is exact — it could not have matched here.
    result.excludePattern = joinPatterns(globs)
  }
  return result
}

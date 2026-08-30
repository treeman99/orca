/**
 * Shared, pure text-search helpers used by both the local main process and the
 * SSH relay. No Electron, child_process, or fs — the caller owns process
 * execution and transport-specific path translation (WSL).
 *
 * Centralizes rg/git-grep arg construction and parsing so the local and relay paths
 * can't re-diverge (notably the relay's old execFile maxBuffer that dropped matches).
 * Design doc: docs/design/share-text-search.md.
 */
import { normalizeSearchResult } from './search-match-count'
import { escapeRegex } from './string-utils'
import type {
  SearchEngine,
  SearchFileResult,
  SearchOptions,
  SearchResult
} from './code-search-types'
import { pushSearchMatch } from './text-search-match-accumulator'
import { splitSearchGlobPatterns, toGitGlobPathspec } from './text-search-glob-patterns'
import { joinSearchRoot, normalizeRelativePath } from './text-search-paths'

export type SearchAccumulator = {
  fileMap: Map<string, SearchFileResult>
  totalMatches: number
  truncated: boolean
  /** Submodule paths the caller gave up on; surfaced by {@link finalize}. */
  skippedSubmodules: string[]
}

export function createAccumulator(): SearchAccumulator {
  return { fileMap: new Map(), totalMatches: 0, truncated: false, skippedSubmodules: [] }
}

// ─── Constants shared by both callers ────────────────────────────────

export const MAX_MATCHES_PER_FILE = 100
export const DEFAULT_SEARCH_MAX_RESULTS = 2000
export const SEARCH_TIMEOUT_MS = 15_000
export const SEARCH_JSON_STRUCTURE_LIMITS = {
  structuralTokens: 32 * 1024,
  nestingDepth: 16
} as const

// Why: keep search cheaper than opening a file; the editor read path has a larger cap (Monaco large-file handling).
export const SEARCH_MAX_FILE_SIZE = 5 * 1024 * 1024

// Why: mega-byte lines (minified/generated files) × 2000-match caps blow past the 16MB SSH relay MAX_MESSAGE_SIZE; clamp each match's context.
export const MAX_LINE_CONTENT_LENGTH = 500

// ─── rg ─────────────────────────────────────────────────────────────

export type SearchOptionsLike = Pick<
  SearchOptions,
  'caseSensitive' | 'wholeWord' | 'useRegex' | 'includePattern' | 'excludePattern'
>

// ─── git grep ───────────────────────────────────────────────────────

export function buildGitGrepArgs(query: string, opts: SearchOptionsLike): string[] {
  // Why: --no-recurse-submodules avoids failing when submodule.recurse=true conflicts with --untracked; --null disambiguates colon-containing filenames.
  const gitArgs: string[] = [
    '-c',
    'submodule.recurse=false',
    'grep',
    '-n',
    '-I',
    '--null',
    '--no-color',
    '--untracked',
    '--no-recurse-submodules'
  ]
  if (!opts.caseSensitive) {
    gitArgs.push('-i')
  }
  if (opts.wholeWord) {
    gitArgs.push('-w')
  }
  if (!opts.useRegex) {
    gitArgs.push('--fixed-strings')
  } else {
    gitArgs.push('--extended-regexp')
  }

  gitArgs.push('-e', query, '--')

  let hasPathspecs = false
  if (opts.includePattern) {
    for (const pat of splitSearchGlobPatterns(opts.includePattern)) {
      gitArgs.push(toGitGlobPathspec(pat))
      hasPathspecs = true
    }
  }
  if (opts.excludePattern) {
    for (const pat of splitSearchGlobPatterns(opts.excludePattern)) {
      gitArgs.push(toGitGlobPathspec(pat, true))
      hasPathspecs = true
    }
  }
  // Why: git grep needs a pathspec to search the working tree; '.' means everything under cwd.
  if (!hasPathspecs) {
    gitArgs.push('.')
  }
  return gitArgs
}

/**
 * Build the JS regex to locate all submatch column positions in a matched line
 * (git grep reports only the first hit per line).
 *
 * @returns `null` when the query is valid git-grep ERE but not a valid JS RegExp
 * (POSIX classes, back-ref numbering, `\<`/`\>` anchors); callers then fall back to a whole-line highlight.
 */
export function buildSubmatchRegex(
  query: string,
  opts: { useRegex?: boolean; wholeWord?: boolean; caseSensitive?: boolean }
): RegExp | null {
  let pattern = opts.useRegex ? query : escapeRegex(query)
  if (opts.wholeWord) {
    pattern = `\\b${pattern}\\b`
  }
  try {
    return new RegExp(pattern, `g${opts.caseSensitive ? '' : 'i'}`)
  } catch {
    return null
  }
}

/**
 * @param relPathPrefix parent-relative directory the emitting `git grep` ran in
 * (a submodule root), so its own-root paths come back as parent-root paths.
 */
export function ingestGitGrepLine(
  line: string,
  rootPath: string,
  submatchRegex: RegExp | null,
  acc: SearchAccumulator,
  maxResults: number,
  relPathPrefix?: string
): 'continue' | 'stop' {
  if (acc.totalMatches >= maxResults) {
    return 'stop'
  }
  if (!line) {
    return 'continue'
  }

  // Why: modern git with --null -n emits filename\0linenum\0content; keep the colon parser too for hosts with older git output.
  const nullIdx = line.indexOf('\0')
  if (nullIdx === -1) {
    return 'continue'
  }
  const ownRelPath = normalizeRelativePath(line.substring(0, nullIdx))
  const relPath = relPathPrefix
    ? normalizeRelativePath(`${relPathPrefix}/${ownRelPath}`)
    : ownRelPath
  const rest = line.substring(nullIdx + 1)
  const secondNullIdx = rest.indexOf('\0')
  let lineNumberText: string
  let lineContent: string
  if (secondNullIdx !== -1) {
    lineNumberText = rest.substring(0, secondNullIdx)
    lineContent = rest.substring(secondNullIdx + 1).replace(/\n$/, '')
  } else {
    const colonIdx = rest.indexOf(':')
    if (colonIdx === -1) {
      return 'continue'
    }
    lineNumberText = rest.substring(0, colonIdx)
    lineContent = rest.substring(colonIdx + 1).replace(/\n$/, '')
  }
  if (!/^\d+$/.test(lineNumberText)) {
    return 'continue'
  }
  const lineNum = Number(lineNumberText)

  const absPath = joinSearchRoot(rootPath, relPath)
  const getFileResult = (): SearchFileResult => {
    let fileResult = acc.fileMap.get(absPath)
    if (!fileResult) {
      fileResult = { filePath: absPath, relativePath: relPath, matches: [], matchCount: 0 }
      acc.fileMap.set(absPath, fileResult)
    }
    return fileResult
  }

  // Why: no JS-side submatch regex (git accepts patterns JS RegExp rejects); fall back to whole-line highlight so the hit still shows.
  if (submatchRegex === null) {
    const fileResult = getFileResult()
    return pushSearchMatch({
      fileResult,
      accumulator: acc,
      lineContent,
      matchStart: 0,
      matchLength: lineContent.length,
      lineNumber: lineNum,
      maxResults
    })
  }

  submatchRegex.lastIndex = 0
  let m: RegExpExecArray | null
  let acceptedLineMatch = false
  while ((m = submatchRegex.exec(lineContent)) !== null) {
    const fileResult = getFileResult()
    acceptedLineMatch = true
    if (
      pushSearchMatch({
        fileResult,
        accumulator: acc,
        lineContent,
        matchStart: m.index,
        matchLength: m[0].length,
        lineNumber: lineNum,
        maxResults
      }) === 'stop'
    ) {
      return 'stop'
    }
    // Prevent infinite loop on zero-length regex matches.
    if (m[0].length === 0) {
      submatchRegex.lastIndex++
    }
  }
  // Why: git grep confirmed the line but JS regex found no occurrence; keep it navigable, don't drop a git-confirmed hit.
  if (!acceptedLineMatch) {
    const fileResult = getFileResult()
    if (
      pushSearchMatch({
        fileResult,
        accumulator: acc,
        lineContent,
        matchStart: 0,
        matchLength: lineContent.length,
        lineNumber: lineNum,
        maxResults
      }) === 'stop'
    ) {
      return 'stop'
    }
  }
  return 'continue'
}

// ─── finalize ───────────────────────────────────────────────────────

export function finalize(acc: SearchAccumulator, engine?: SearchEngine): SearchResult {
  const result: SearchResult = normalizeSearchResult({
    files: Array.from(acc.fileMap.values()).filter((file) => file.matches.length > 0),
    totalMatches: acc.totalMatches,
    truncated: acc.truncated
  })
  if (engine) {
    result.engine = engine
  }
  if (acc.skippedSubmodules.length > 0) {
    result.skippedSubmodules = [...acc.skippedSubmodules]
  }
  return result
}

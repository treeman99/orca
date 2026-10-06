import {
  SEARCH_JSON_STRUCTURE_LIMITS,
  SEARCH_MAX_FILE_SIZE,
  type SearchAccumulator,
  type SearchOptionsLike
} from './text-search'
import { parseRipgrepMatchJson, type RipgrepMatchMessage } from './ripgrep-dense-match-json'
import { pushSearchMatch } from './text-search-match-accumulator'
import { splitSearchGlobPatterns } from './text-search-glob-patterns'
import {
  normalizeRelativePath,
  relativeToSearchRoot,
  resolveSearchResultPath
} from './text-search-paths'
import { ripgrepMatchRanges } from './ripgrep-match-offsets'
import { decodeRipgrepLine } from './ripgrep-line-decoding'

/**
 * Build the complete rg argv (flags + `--` + query + target) for both callers to spawn as-is.
 *
 * Use target `.` with cwd set to the search root so anchored globs match root-relative paths.
 */
export function buildRgArgs(query: string, target: string, opts: SearchOptionsLike): string[] {
  const args: string[] = [
    '--no-config',
    '--json',
    '--hidden',
    '--glob',
    '!.git',
    '--max-filesize',
    `${Math.floor(SEARCH_MAX_FILE_SIZE / 1024 / 1024)}M`
  ]
  if (!opts.caseSensitive) {
    args.push('--ignore-case')
  }
  if (opts.wholeWord) {
    args.push('--word-regexp')
  }
  if (!opts.useRegex) {
    args.push('--fixed-strings')
  }
  if (opts.includePattern) {
    for (const pat of splitSearchGlobPatterns(opts.includePattern, 'rg')) {
      args.push('--glob', pat)
    }
  }
  if (opts.excludePattern) {
    for (const pat of splitSearchGlobPatterns(opts.excludePattern, 'rg')) {
      args.push('--glob', `!${pat}`)
    }
  }
  args.push('--', query, target)
  return args
}

/**
 * Ingest a single line of rg `--json` stdout, mutating `acc`. Returns 'stop' when
 * `maxResults` is reached (so the caller can kill the child), else 'continue'.
 * `transformAbsPath` lets the local caller apply WSL translation; the relay passes none.
 *
 * Invariant: sets `acc.truncated = true` synchronously in the same tick it returns
 * 'stop'; callers must not flip `truncated` or resolve before that tick (see design doc).
 */
export function ingestRgJsonLine(
  line: string,
  rootPath: string,
  acc: SearchAccumulator,
  maxResults: number,
  transformAbsPath?: (p: string) => string | null
): 'continue' | 'stop' {
  if (acc.totalMatches >= maxResults) {
    return 'stop'
  }
  if (!line) {
    return 'continue'
  }
  let msg: RipgrepMatchMessage
  try {
    msg = parseRipgrepMatchJson(line, maxResults - acc.totalMatches, SEARCH_JSON_STRUCTURE_LIMITS)
  } catch {
    acc.truncated = true
    return 'continue'
  }
  if (msg.type !== 'match' || !msg.data) {
    return 'continue'
  }
  const data = msg.data
  const rawPath = data.path?.text
  if (typeof rawPath !== 'string') {
    // File APIs accept strings, so byte-only filenames cannot be opened losslessly.
    acc.truncated = true
    return 'continue'
  }
  const mappedPath = transformAbsPath ? transformAbsPath(rawPath) : rawPath
  if (mappedPath === null) {
    acc.truncated = true
    return 'continue'
  }
  const absPath = resolveSearchResultPath(rootPath, mappedPath)
  const relPath = normalizeRelativePath(relativeToSearchRoot(rootPath, absPath), rootPath)
  const { text: lineContent, readOffset } = decodeRipgrepLine(data.lines)
  const lineNumber = data.line_number ?? 0
  for (const sub of ripgrepMatchRanges(lineContent, data.submatches ?? [], readOffset, () => {
    acc.truncated = true
  })) {
    let fileResult = acc.fileMap.get(absPath)
    if (!fileResult) {
      fileResult = { filePath: absPath, relativePath: relPath, matches: [], matchCount: 0 }
      acc.fileMap.set(absPath, fileResult)
    }
    if (
      pushSearchMatch({
        fileResult,
        accumulator: acc,
        lineContent,
        matchStart: sub.start,
        matchLength: sub.end - sub.start,
        lineNumber,
        maxResults
      }) === 'stop'
    ) {
      return 'stop'
    }
  }
  return 'continue'
}

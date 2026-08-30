import {
  MAX_MATCHES_PER_FILE,
  SEARCH_JSON_STRUCTURE_LIMITS,
  SEARCH_MAX_FILE_SIZE,
  type SearchAccumulator,
  type SearchOptionsLike
} from './text-search'
import { assertJsonTextStructureWithinLimits } from './json-text-structure-limit'
import { pushSearchMatch } from './text-search-match-accumulator'
import { splitSearchGlobPatterns } from './text-search-glob-patterns'
import { normalizeRelativePath, relativeToSearchRoot } from './text-search-paths'

/**
 * Build the complete rg argv (flags + `--` + query + target) for both callers to spawn as-is.
 *
 * Constraint: pass `rootPath` unchanged as `target` — do NOT WSL-translate it; only the rg
 * invocation is routed through `wslAwareSpawn`, and output paths are translated back in `ingestRgJsonLine`.
 */
export function buildRgArgs(query: string, target: string, opts: SearchOptionsLike): string[] {
  const args: string[] = [
    '--json',
    '--hidden',
    '--glob',
    '!.git',
    '--max-count',
    String(MAX_MATCHES_PER_FILE),
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
    for (const pat of splitSearchGlobPatterns(opts.includePattern)) {
      args.push('--glob', pat)
    }
  }
  if (opts.excludePattern) {
    for (const pat of splitSearchGlobPatterns(opts.excludePattern)) {
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
  transformAbsPath?: (p: string) => string
): 'continue' | 'stop' {
  if (acc.totalMatches >= maxResults) {
    return 'stop'
  }
  if (!line) {
    return 'continue'
  }
  let msg: {
    type?: string
    data?: {
      path?: { text?: string }
      submatches?: { start: number; end: number }[]
      line_number?: number
      lines?: { text?: string }
    }
  }
  try {
    assertJsonTextStructureWithinLimits(line, SEARCH_JSON_STRUCTURE_LIMITS)
    msg = JSON.parse(line)
  } catch {
    return 'continue'
  }
  if (msg.type !== 'match' || !msg.data) {
    return 'continue'
  }
  const data = msg.data
  const rawPath = data.path?.text
  if (typeof rawPath !== 'string') {
    return 'continue'
  }
  const absPath = transformAbsPath ? transformAbsPath(rawPath) : rawPath
  const relPath = normalizeRelativePath(relativeToSearchRoot(rootPath, absPath))
  const lineContent = (data.lines?.text ?? '').replace(/\n$/, '')
  const lineNumber = data.line_number ?? 0
  let submatches = data.submatches ?? []
  if (submatches.length === 0) {
    // Why: some rg matches report a line but no submatch ranges; surface a navigable line-level result instead of a count-0 row.
    submatches = [{ start: 0, end: lineContent.length > 0 ? 1 : 0 }]
  }

  for (const sub of submatches) {
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

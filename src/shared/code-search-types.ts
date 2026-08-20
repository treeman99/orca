// ─── Search ─────────────────────────────────────────────
export type SearchMatch = {
  line: number
  column: number
  matchLength: number
  lineContent: string
  displayColumn?: number
  displayMatchLength?: number
}

export type SearchFileResult = {
  filePath: string
  relativePath: string
  matches: SearchMatch[]
  matchCount?: number
}

/** Which backend produced a result. Optional: a pre-v1.5 remote host omits it. */
export type SearchEngine = 'ripgrep' | 'git-grep'

export type SearchResult = {
  files: SearchFileResult[]
  totalMatches: number
  truncated: boolean
  engine?: SearchEngine
  /**
   * Submodules the git-grep fallback left unsearched because an include/exclude
   * glob had no submodule-relative equivalent. Parent-worktree-relative paths.
   */
  skippedSubmodules?: string[]
}

export type SearchOptions = {
  query: string
  rootPath: string
  caseSensitive?: boolean
  wholeWord?: boolean
  useRegex?: boolean
  includePattern?: string
  excludePattern?: string
  maxResults?: number
}

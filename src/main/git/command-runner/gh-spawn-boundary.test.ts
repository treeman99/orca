import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard the gh chokepoint the way `child-process-import-boundary` guards spawn.
 *
 * `ghExecFileAsync` is what gives a gh invocation a deadline, a process-tree
 * kill, transient-error retry, the rate-limit breaker, and WSL/host routing.
 * Two call sites quietly opted out of all of it by reaching for the legacy
 * `execFileAsync('gh', …)`, and one of them left `gh` children spinning at 100%
 * CPU forever while permanently exhausting the GitHub concurrency semaphore
 * (#18234). Nothing about those call sites looked wrong locally — which is why
 * this is a tree-level rule rather than a review habit.
 *
 * The allowlist holds one fork-owned file and may only shrink.
 */
const GH_SPAWN_PATTERN =
  /(?:execFileAsync|commandExecFileAsync|execFileCapture|runProcess|spawnProcess|execFile|spawnSync|spawn)\s*\(\s*(['"`])gh\1|program:\s*(['"`])gh\2/

// Why trailing slash: a sibling like command-runner-extras.ts is scanned, not exempted.
const OWNER_DIRECTORY = 'src/main/git/command-runner/'

/**
 * Fork-owned: the GHES sign-in lane, which cannot route through `ghExecFileAsync`.
 *
 * `gh auth login --web` is an interactive device flow — it prints a one-time code, waits for
 * Enter, and opens a browser, so it needs a real PTY rather than a captured exec. The
 * `--with-token` fallback pipes a token on stdin, which the exec helper does not carry either.
 * Neither is a GitHub API call, so neither should hold the API concurrency semaphore or trip
 * the rate-limit breaker that this chokepoint exists to apply.
 */
const INTERACTIVE_LOGIN_EXEMPTIONS = new Set(['src/main/github/github-enterprise-login.ts'])
const SCANNED_EXTENSIONS = ['.ts', '.tsx']
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'out',
  'build',
  '.git',
  '__fixtures__'
])

function isTestFile(path: string): boolean {
  return /\.(?:test|spec)\.tsx?$/.test(path) || path.includes('/__tests__/')
}

function collectSourceFiles(root: string): string[] {
  let found: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return found
  }
  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry)) {
      continue
    }
    const full = join(root, entry)
    if (statSync(full).isDirectory()) {
      found = found.concat(collectSourceFiles(full))
      continue
    }
    if (SCANNED_EXTENSIONS.some((extension) => full.endsWith(extension))) {
      found.push(full)
    }
  }
  return found
}

describe('gh spawn boundary', () => {
  it('routes every gh invocation through ghExecFileAsync', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..', '..')
    const offenders = collectSourceFiles(join(repoRoot, 'src'))
      .map((path) => relative(repoRoot, path).split('\\').join('/'))
      .filter(
        (path) =>
          !isTestFile(path) &&
          !path.startsWith(OWNER_DIRECTORY) &&
          !INTERACTIVE_LOGIN_EXEMPTIONS.has(path)
      )
      .filter((path) => GH_SPAWN_PATTERN.test(readFileSync(join(repoRoot, path), 'utf8')))

    expect(offenders).toEqual([])
  })
})

/**
 * Argument builder for the Source Control status poll, shared by the main
 * process and the relay so the two execution paths cannot drift. A divergence
 * here is invisible locally and only shows up over SSH.
 */
export type GitStatusCommandArgsOptions = {
  includeIgnored?: boolean
}

/**
 * Build the `git status` argv used by Source Control polling.
 *
 * `--ignore-submodules=none` restores Git's own documented default for
 * `git status`. Without it a repo-supplied `submodule.<name>.ignore` (settable
 * in the checked-in `.gitmodules`, so it hits every clone) or a
 * `diff.ignoreSubmodules` config silently suppresses the gitlink row: with
 * `ignore = all` the submodule disappears from the panel entirely, and with
 * `ignore = dirty` its `S` field reports `S...`/`SC..`, hiding the modified and
 * untracked markers that make the row expandable. Everything Source Control
 * knows about a submodule hangs off that one row.
 *
 * Baseline: `--ignore-submodules[=<when>]` has been a `git status` option since
 * Git 1.7.2, far below the Git 2.25 compatibility baseline, so no capability
 * probe or fallback is required (see docs/reference/git-compatibility.md).
 * Cost stays at one git process — the submodule dirty check runs inside the
 * same status invocation rather than spawning a git per submodule.
 */
export function buildGitStatusCommandArgs(options: GitStatusCommandArgsOptions = {}): string[] {
  const args = [
    '-c',
    'core.quotePath=false',
    'status',
    '--porcelain=v2',
    '--branch',
    '--untracked-files=all',
    '--ignore-submodules=none'
  ]
  if (options.includeIgnored) {
    args.push('--ignored=matching')
  }
  return args
}

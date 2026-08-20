/**
 * A submodule that was never `git submodule update --init`ed has a directory but
 * no checkout, so its status call fails. That is an ordinary, expected state —
 * surfacing it as a red error banner would make a freshly cloned repo look broken.
 */
const UNINITIALIZED_PATTERNS: readonly RegExp[] = [
  /not a git repository/i,
  /no such file or directory/i,
  /\bENOENT\b/,
  /does not exist/i,
  /not initialized/i
]

export function isUninitializedSubmoduleError(message: string): boolean {
  return UNINITIALIZED_PATTERNS.some((pattern) => pattern.test(message))
}

/**
 * Detect a Git failure caused by an unborn HEAD (a repository with no commit yet).
 *
 * Why it matters for unstaging: `git restore --staged` needs HEAD to resolve and exits
 * 128 before the first commit, while `git reset -- <paths>` treats a missing HEAD as the
 * empty tree and unstages correctly. A freshly added submodule is the common case.
 */
const UNBORN_HEAD_PATTERNS = [
  /could not resolve HEAD/i,
  /ambiguous argument 'HEAD'/i,
  /unknown revision or path not in the working tree/i,
  /Failed to resolve 'HEAD' as a valid ref/i
]

export function isUnbornHeadGitError(error: unknown): boolean {
  const text = collectErrorText(error)
  return text !== '' && UNBORN_HEAD_PATTERNS.some((pattern) => pattern.test(text))
}

function collectErrorText(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }
  if (typeof error !== 'object' || error === null) {
    return ''
  }
  const record = error as Record<string, unknown>
  return ['stderr', 'stdout', 'message']
    .map((field) => (typeof record[field] === 'string' ? (record[field] as string) : ''))
    .join('\n')
}

/**
 * Does this diff actually show a change? Shared by the main process and the
 * relay so submodule diff routing picks the same side on both.
 *
 * Used to decide, for a file inside a submodule, whether the user's uncommitted
 * edit or the recorded→checkout commit range is the diff worth opening. A
 * submodule parked on its own branch has a moved gitlink almost always, so
 * routing purely on "the gitlink moved" showed the commit range for files the
 * user had just edited.
 */
export function gitDiffHasChange(diff: {
  originalContent?: string
  modifiedContent?: string
}): boolean {
  return (diff.originalContent ?? '') !== (diff.modifiedContent ?? '')
}

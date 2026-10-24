export type MergeCompletionSteps = {
  /** Asked only when ranges are still unhandled; false backs out with nothing written. */
  confirmWithUnhandled: (unhandledCount: number) => Promise<boolean>
  save: (content: string) => Promise<boolean>
  stage: () => Promise<void>
  refreshStatus: () => Promise<void>
  leaveMergeView: () => void
}

export type MergeCompletionOutcome =
  | { kind: 'completed' }
  | { kind: 'cancelled' }
  | { kind: 'not-saved' }
  | { kind: 'stage-failed'; error: unknown }

/** "Complete Merge" (O11): confirm open conflicts, write the result, then mark it resolved in git. */
export async function completeMerge(
  result: string,
  unhandledCount: number,
  steps: MergeCompletionSteps
): Promise<MergeCompletionOutcome> {
  if (unhandledCount > 0 && !(await steps.confirmWithUnhandled(unhandledCount))) {
    return { kind: 'cancelled' }
  }
  // Why: staging before the write lands would record the conflicted file as resolved.
  if (!(await steps.save(result))) {
    return { kind: 'not-saved' }
  }
  try {
    await steps.stage()
  } catch (error) {
    return { kind: 'stage-failed', error }
  }
  try {
    await steps.refreshStatus()
  } catch (error) {
    // Why: the file is already resolved in git; the next status poll catches the panel up.
    console.warn('[merge-editor] git status refresh after completing the merge failed', error)
  }
  steps.leaveMergeView()
  return { kind: 'completed' }
}

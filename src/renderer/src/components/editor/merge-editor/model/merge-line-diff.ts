import { diffArrays } from 'diff'
import type { LineDiff } from './merge-editor-types'

// Why: a wholesale rewrite then costs one coarse diff instead of freezing the renderer.
const MAX_EDIT_LENGTH = 2000

/** Line diffs from `base` to `input`, sorted by base position and separated by unchanged lines. */
export function computeLineDiffs(base: readonly string[], input: readonly string[]): LineDiff[] {
  let prefix = 0
  while (prefix < base.length && prefix < input.length && base[prefix] === input[prefix]) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < base.length - prefix &&
    suffix < input.length - prefix &&
    base[base.length - 1 - suffix] === input[input.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const baseMiddle = base.slice(prefix, base.length - suffix)
  const inputMiddle = input.slice(prefix, input.length - suffix)
  if (baseMiddle.length === 0 && inputMiddle.length === 0) {
    return []
  }
  const changes = diffArrays(baseMiddle, inputMiddle, { maxEditLength: MAX_EDIT_LENGTH })
  if (!changes) {
    return [
      {
        base: { start: prefix + 1, endExclusive: base.length - suffix + 1 },
        input: { start: prefix + 1, endExclusive: input.length - suffix + 1 }
      }
    ]
  }

  const diffs: LineDiff[] = []
  let baseLine = prefix + 1
  let inputLine = prefix + 1
  let pendingBaseStart: number | null = null
  let pendingInputStart = 0
  const flush = (): void => {
    if (pendingBaseStart !== null) {
      diffs.push({
        base: { start: pendingBaseStart, endExclusive: baseLine },
        input: { start: pendingInputStart, endExclusive: inputLine }
      })
      pendingBaseStart = null
    }
  }
  for (const change of changes) {
    if (!change.added && !change.removed) {
      flush()
      baseLine += change.count
      inputLine += change.count
      continue
    }
    if (pendingBaseStart === null) {
      pendingBaseStart = baseLine
      pendingInputStart = inputLine
    }
    if (change.removed) {
      baseLine += change.count
    } else {
      inputLine += change.count
    }
  }
  flush()
  return diffs
}

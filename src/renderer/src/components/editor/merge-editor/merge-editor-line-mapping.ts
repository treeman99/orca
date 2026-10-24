import type { LineRange } from './model/merge-editor-model'

/**
 * Maps a line between two documents through their aligned ranges (D6): inside a range it keeps
 * its offset, clamped to the target range; between ranges it keeps the distance from the last one.
 */
export function mapLineThroughRanges(
  line: number,
  from: readonly LineRange[],
  to: readonly LineRange[]
): number {
  let delta = 0
  for (let index = 0; index < from.length; index++) {
    const source = from[index]
    const target = to[index]
    if (!target || line < source.start) {
      break
    }
    if (line < source.endExclusive) {
      const targetLength = target.endExclusive - target.start
      return Math.max(
        1,
        target.start + Math.min(line - source.start, Math.max(0, targetLength - 1))
      )
    }
    delta = target.endExclusive - source.endExclusive
  }
  return Math.max(1, line + delta)
}

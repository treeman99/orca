import type { LineDiff, LineRange } from './merge-editor-types'

function lineCount(range: LineRange): number {
  return range.endExclusive - range.start
}

/** Overlapping or adjacent; an empty range touches the ranges that end or start at it. */
function rangesTouch(a: LineRange, b: LineRange): boolean {
  return a.start <= b.endExclusive && b.start <= a.endExclusive
}

function diffDelta(diff: LineDiff): number {
  return lineCount(diff.input) - lineCount(diff.base)
}

export type BaseRangeProjection = {
  /** Diffs whose base range overlaps or touches the projected range. */
  touching: LineDiff[]
  /** The projected range widened to cover every touching diff. */
  base: LineRange
  /** Where `base` lands on the diffed side. */
  output: LineRange
}

/** Maps a base range through base-sorted, non-overlapping diffs of one side. */
export function projectBaseRange(
  diffs: readonly LineDiff[],
  range: LineRange
): BaseRangeProjection {
  const touching: LineDiff[] = []
  let deltaBefore = 0
  for (const diff of diffs) {
    if (rangesTouch(diff.base, range)) {
      touching.push(diff)
    } else if (diff.base.endExclusive < range.start) {
      deltaBefore += diffDelta(diff)
    } else {
      break
    }
  }
  const base = {
    start: Math.min(range.start, ...touching.map((diff) => diff.base.start)),
    endExclusive: Math.max(range.endExclusive, ...touching.map((diff) => diff.base.endExclusive))
  }
  const touchingDelta = touching.reduce((sum, diff) => sum + diffDelta(diff), 0)
  return {
    touching,
    base,
    output: {
      start: base.start + deltaBefore,
      endExclusive: base.endExclusive + deltaBefore + touchingDelta
    }
  }
}

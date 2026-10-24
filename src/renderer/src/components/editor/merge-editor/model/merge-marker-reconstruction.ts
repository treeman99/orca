import {
  CONFLICT_BASE_MARKER,
  CONFLICT_END_MARKER,
  CONFLICT_SEPARATOR_MARKER,
  CONFLICT_START_MARKER,
  isConflictMarkerLine
} from './merge-conflict-markers'
import { detectEol, joinLines, splitLines } from './merge-text-lines'

export type InputsFromMarkers = { base: string; input1: string; input2: string; hasBase: boolean }

type Section = 'outside' | 'current' | 'base' | 'incoming'

/**
 * Rebuilds the three inputs from a conflicted working file (D5): input1 takes each block's
 * current (first) side, input2 its incoming side, base its diff3 section or nothing.
 * Null when the file has no complete conflict block.
 */
export function reconstructInputsFromMarkers(text: string): InputsFromMarkers | null {
  const base: string[] = []
  const current: string[] = []
  const incoming: string[] = []
  let section: Section = 'outside'
  let blocks = 0
  let blocksWithBase = 0
  for (const line of splitLines(text)) {
    const opensOrCloses =
      isConflictMarkerLine(line, CONFLICT_START_MARKER) ||
      isConflictMarkerLine(line, CONFLICT_END_MARKER)
    switch (section) {
      case 'outside':
        if (isConflictMarkerLine(line, CONFLICT_START_MARKER)) {
          section = 'current'
          blocks += 1
        } else {
          base.push(line)
          current.push(line)
          incoming.push(line)
        }
        break
      case 'current':
        if (isConflictMarkerLine(line, CONFLICT_BASE_MARKER)) {
          section = 'base'
          blocksWithBase += 1
        } else if (isConflictMarkerLine(line, CONFLICT_SEPARATOR_MARKER)) {
          section = 'incoming'
        } else if (opensOrCloses) {
          return null
        } else {
          current.push(line)
        }
        break
      case 'base':
        if (isConflictMarkerLine(line, CONFLICT_SEPARATOR_MARKER)) {
          section = 'incoming'
        } else if (opensOrCloses) {
          return null
        } else {
          base.push(line)
        }
        break
      case 'incoming':
        if (isConflictMarkerLine(line, CONFLICT_END_MARKER)) {
          section = 'outside'
        } else if (isConflictMarkerLine(line, CONFLICT_START_MARKER)) {
          return null
        } else {
          incoming.push(line)
        }
        break
    }
  }
  if (section !== 'outside' || blocks === 0) {
    return null
  }
  const eol = detectEol(text)
  return {
    base: joinLines(base, eol),
    input1: joinLines(current, eol),
    input2: joinLines(incoming, eol),
    hasBase: blocksWithBase === blocks
  }
}

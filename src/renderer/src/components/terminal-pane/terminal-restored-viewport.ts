import type { RefObject } from 'react'

export type RestoredViewportBlankingPanesRef = RefObject<Set<number>>

/** Whether a restored pane's cursor was re-anchored by an authoritative repaint. */
export type RestoredViewportCursorAuthority =
  /** A snapshot / replay / cold-restore payload repainted the pane; its own
   *  clear+cursor epilogue owns the viewport from here on. */
  | 'repainted'
  /** The connection resolved without any payload, so the only thing on screen is
   *  the persisted layout buffer and the cursor still sits where the PREVIOUS
   *  run's serialization left it. */
  | 'restored-buffer-only'

export function buildFreshShellViewportBlankingSequence(rows: number): string {
  const viewportRows = Math.max(1, Math.floor(Number.isFinite(rows) ? rows : 24))
  // Why: newline scrolling preserves restored rows in xterm scrollback; CSI S
  // drops them. Reset margins first so stale TUI scroll regions cannot trap it.
  return `\x1b[?6l\x1b[r\x1b[${viewportRows};1H${'\r\n'.repeat(viewportRows)}\x1b[H`
}

/**
 * A pane that replayed a persisted layout buffer into a fresh xterm shows rows
 * whose cursor belongs to the previous run. Every structural payload starts by
 * clearing the pane, so a repaint re-anchors it; a reattach that resolves with
 * no payload does not, and the live session then writes over the restored rows
 * from that stale position. Blank the viewport in that case — scrollback keeps
 * the rows, and the next prompt starts on a clean line.
 */
export function shouldBlankRestoredViewportOnReattach(args: {
  hasRestoredViewport: boolean
  cursorAuthority: RestoredViewportCursorAuthority
}): boolean {
  return args.hasRestoredViewport && args.cursorAuthority === 'restored-buffer-only'
}

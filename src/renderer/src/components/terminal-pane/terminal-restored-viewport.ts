import type { RefObject } from 'react'

import {
  DEAD_TUI_SHELL_HANDOFF_RESET,
  SAVE_GROUNDED_CURSOR
} from '../../../../shared/terminal-mode-reset-profiles'

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

/**
 * Viewport reset a pane needs before a replacement shell writes into it.
 *
 * Blanking alone is enough only while the pane sits on the normal buffer. A
 * dead agent TUI leaves `?1049h` unbalanced, so the scroll runs on the
 * alternate buffer — which has no scrollback — and the restored rows stay
 * parked in the normal buffer with the dead run's cursor. The next `?1049l`
 * (ConPTY's startup sync, a resumed agent, a pager) then drops the live shell
 * straight back on top of them: the "restart draws the new prompt over the old
 * conversation" report.
 *
 * The alt-screen exit is conditional because `?1049l` is not a no-op on a pane
 * already on the normal buffer — xterm skips the swap but still runs
 * restoreCursor(), which would fling the cursor at a stale DECSC register.
 *
 * `ownerProcessEnded` is the seam against a live reattach: only a pane whose
 * process is gone may have its modes, pen and saved cursor grounded, because a
 * reattached TUI still owns all three.
 */
export function buildRestoredViewportResetSequence(args: {
  rows: number
  paneOnAlternateScreen: boolean
  ownerProcessEnded: boolean
}): string {
  const leaveAlternateScreen = args.paneOnAlternateScreen ? '\x1b[?1049l' : ''
  const groundDeadTuiState = args.ownerProcessEnded ? DEAD_TUI_SHELL_HANDOFF_RESET : ''
  // After the blanking homes the cursor, so a stray DECRC lands on a clean row.
  const groundSavedCursor = args.ownerProcessEnded ? SAVE_GROUNDED_CURSOR : ''
  return `${leaveAlternateScreen}${groundDeadTuiState}${buildFreshShellViewportBlankingSequence(
    args.rows
  )}${groundSavedCursor}`
}

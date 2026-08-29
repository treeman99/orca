import type { ManagedPaneInternal } from '@/lib/pane-manager/pane-manager-types'
import { requestStablePaneFit } from '@/lib/pane-manager/pane-fit-resize-observer'
import {
  createForegroundGridDriftGateState,
  resetForegroundGridDriftGate,
  shouldActOnForegroundGridDrift
} from '../foreground-grid-drift-gate'
import { FOREGROUND_GRID_DRIFT_CHECK_MIN_MS } from './foreground-output-budgets'
import type { ConnectPanePtySession } from './connect-pane-pty-session'

/**
 * Heal a desktop pane whose xterm grid drifted from what FitAddon now proposes.
 *
 * Split out of pty-input-forward for max-lines. The input-quiet gate is the point: this
 * check is armed by output, so an unguarded fit SIGWINCHes an agent CLI mid-keystroke.
 */
export function installForegroundGridDriftCheck(session: ConnectPanePtySession): void {
  session.pendingForegroundGridDriftCheckRaf = null
  session.lastForegroundGridDriftCheckAt = Number.NEGATIVE_INFINITY
  const foregroundGridDriftGate = createForegroundGridDriftGateState()
  session.readProposedTerminalGrid = (): { cols: number; rows: number } | null => {
    try {
      const proposed = session.pane.fitAddon.proposeDimensions()
      if (!proposed || proposed.cols <= 0 || proposed.rows <= 0) {
        return null
      }
      return proposed
    } catch {
      return null
    }
  }
  const readDriftedTerminalGrid = (): { cols: number; rows: number } | null => {
    const proposed = session.readProposedTerminalGrid()
    if (
      !proposed ||
      (session.pane.terminal.cols === proposed.cols && session.pane.terminal.rows === proposed.rows)
    ) {
      return null
    }
    return proposed
  }
  session.scheduleForegroundGridDriftCheck = (): void => {
    // Why: mobile-owned PTYs intentionally keep a non-desktop grid; drift
    // healing would refit xterm even if resize forwarding is later suppressed.
    if (
      session.disposed ||
      !session.deps.isVisibleRef.current ||
      session.shouldSuppressDesktopPtyResize() ||
      session.pendingForegroundGridDriftCheckRaf !== null
    ) {
      return
    }
    const now = performance.now()
    if (now - session.lastForegroundGridDriftCheckAt < FOREGROUND_GRID_DRIFT_CHECK_MIN_MS) {
      return
    }
    session.lastForegroundGridDriftCheckAt = now
    session.pendingForegroundGridDriftCheckRaf = requestAnimationFrame(() => {
      session.pendingForegroundGridDriftCheckRaf = null
      if (
        session.disposed ||
        !session.deps.isVisibleRef.current ||
        session.shouldSuppressDesktopPtyResize()
      ) {
        return
      }
      const drifted = readDriftedTerminalGrid()
      if (!drifted) {
        resetForegroundGridDriftGate(foregroundGridDriftGate)
        return
      }
      // Why: this check is armed by output, and an agent CLI echoes every
      // keystroke — fitting here mid-burst SIGWINCHes the CLI into reflowing the
      // prompt line the user is typing. Gate on a quiet input window plus a
      // repeated observation so only a settled drift reaches the PTY.
      if (
        !shouldActOnForegroundGridDrift({
          state: foregroundGridDriftGate,
          proposed: drifted,
          msSinceLastInput: performance.now() - session.lastTerminalInputAt
        })
      ) {
        return
      }
      // Why: xterm cell metrics can settle after the DOM box stops resizing, so
      // ResizeObserver never fires even though FitAddon now proposes more cols.
      requestStablePaneFit(session.pane as ManagedPaneInternal, () =>
        session.ptySizeReassertion.request({ fit: false })
      )
    })
  }
}

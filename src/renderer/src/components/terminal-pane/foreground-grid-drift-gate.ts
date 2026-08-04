// Why: every foreground PTY chunk arms the grid-drift check, and an agent CLI
// echoes each keystroke — so without a gate the check can fit + SIGWINCH mid
// typing, making the CLI reflow its prompt box onto a new line (#issue-4).

export type ForegroundGridDriftObservation = { cols: number; rows: number }

export type ForegroundGridDriftGateState = {
  observed: ForegroundGridDriftObservation | null
  repeats: number
}

// Why: matches FOREGROUND_GRID_DRIFT_CHECK_MIN_MS, so a typing burst whose
// inter-keystroke gap stays under the check's own throttle can never open the
// gate, while a genuine drift still heals a quarter second after the user stops.
export const FOREGROUND_GRID_DRIFT_INPUT_QUIET_MS = 250

// Why: the WebGL/DOM cell-metric wobble is a single-observation artifact of a
// renderer re-attach (see pane-reveal-fit.ts) and resolves once metrics settle;
// a real divergence (DPI change, snapshot restore) repeats. Two identical
// observations separate the two without delaying healing past one extra check.
export const FOREGROUND_GRID_DRIFT_REQUIRED_OBSERVATIONS = 2

export function createForegroundGridDriftGateState(): ForegroundGridDriftGateState {
  return { observed: null, repeats: 0 }
}

export function resetForegroundGridDriftGate(state: ForegroundGridDriftGateState): void {
  state.observed = null
  state.repeats = 0
}

/**
 * Whether an output-armed drift observation may re-fit and re-assert the PTY grid.
 *
 * Records every observation so consecutive-sameness keeps accumulating while the
 * user types; only the decision to act is withheld during a typing burst.
 */
export function shouldActOnForegroundGridDrift(args: {
  state: ForegroundGridDriftGateState
  proposed: ForegroundGridDriftObservation
  msSinceLastInput: number
  quietWindowMs?: number
  requiredObservations?: number
}): boolean {
  const {
    state,
    proposed,
    msSinceLastInput,
    quietWindowMs = FOREGROUND_GRID_DRIFT_INPUT_QUIET_MS,
    requiredObservations = FOREGROUND_GRID_DRIFT_REQUIRED_OBSERVATIONS
  } = args

  const previous = state.observed
  if (previous && previous.cols === proposed.cols && previous.rows === proposed.rows) {
    state.repeats += 1
  } else {
    state.observed = { cols: proposed.cols, rows: proposed.rows }
    state.repeats = 1
  }

  if (state.repeats < requiredObservations) {
    return false
  }
  // Why: NEGATIVE_INFINITY seeds "no input yet", so this stays true before the
  // first keystroke and a freshly revealed pane still heals immediately.
  return msSinceLastInput >= quietWindowMs
}

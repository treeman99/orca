import { describe, expect, it } from 'vitest'
import {
  createForegroundGridDriftGateState,
  FOREGROUND_GRID_DRIFT_INPUT_QUIET_MS,
  FOREGROUND_GRID_DRIFT_REQUIRED_OBSERVATIONS,
  resetForegroundGridDriftGate,
  shouldActOnForegroundGridDrift
} from './foreground-grid-drift-gate'

const QUIET = FOREGROUND_GRID_DRIFT_INPUT_QUIET_MS
const GRID = { cols: 120, rows: 30 }

function act(
  state: ReturnType<typeof createForegroundGridDriftGateState>,
  proposed: { cols: number; rows: number },
  msSinceLastInput: number
): boolean {
  return shouldActOnForegroundGridDrift({ state, proposed, msSinceLastInput })
}

describe('foreground grid drift gate', () => {
  it('never forwards a resize while the user is mid typing burst', () => {
    const state = createForegroundGridDriftGateState()

    // A keystroke echo arms the check repeatedly, each within the quiet window.
    for (let i = 0; i < 20; i += 1) {
      expect(act(state, GRID, 40)).toBe(false)
    }
  })

  it('does not act on a single transient observation even when the pane is quiet', () => {
    const state = createForegroundGridDriftGateState()

    expect(act(state, GRID, QUIET * 10)).toBe(false)
  })

  it('heals a sustained drift once the user stops typing', () => {
    const state = createForegroundGridDriftGateState()

    expect(act(state, GRID, 40)).toBe(false)
    expect(act(state, GRID, QUIET)).toBe(true)
  })

  it('resets the streak when the proposed grid wobbles, so a flip-flop never reaches the PTY', () => {
    const state = createForegroundGridDriftGateState()

    // The documented WebGL vs DOM cell-metric wobble alternates by one column.
    expect(act(state, { cols: 120, rows: 30 }, QUIET * 4)).toBe(false)
    expect(act(state, { cols: 119, rows: 30 }, QUIET * 4)).toBe(false)
    expect(act(state, { cols: 120, rows: 30 }, QUIET * 4)).toBe(false)
    expect(act(state, { cols: 119, rows: 30 }, QUIET * 4)).toBe(false)
  })

  it('acts before the first keystroke so a freshly revealed pane still heals', () => {
    const state = createForegroundGridDriftGateState()

    expect(act(state, GRID, Number.POSITIVE_INFINITY)).toBe(false)
    expect(act(state, GRID, Number.POSITIVE_INFINITY)).toBe(true)
  })

  it('holds a confirmed drift back until the burst ends, then releases it immediately', () => {
    const state = createForegroundGridDriftGateState()

    // Streak accrues during typing but must not act.
    expect(act(state, GRID, 10)).toBe(false)
    expect(act(state, GRID, 10)).toBe(false)
    expect(act(state, GRID, 10)).toBe(false)
    // The moment the user pauses, the already-confirmed drift heals.
    expect(act(state, GRID, QUIET)).toBe(true)
  })

  it('requires the configured number of identical observations', () => {
    const state = createForegroundGridDriftGateState()

    for (let i = 1; i < FOREGROUND_GRID_DRIFT_REQUIRED_OBSERVATIONS; i += 1) {
      expect(act(state, GRID, QUIET)).toBe(false)
    }
    expect(act(state, GRID, QUIET)).toBe(true)
  })

  it('starts over after a reset', () => {
    const state = createForegroundGridDriftGateState()

    expect(act(state, GRID, QUIET)).toBe(false)
    resetForegroundGridDriftGate(state)
    expect(act(state, GRID, QUIET)).toBe(false)
    expect(act(state, GRID, QUIET)).toBe(true)
  })
})

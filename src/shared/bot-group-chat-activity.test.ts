import { describe, expect, it } from 'vitest'
import {
  describeMemberTurnActivity,
  formatTurnElapsed,
  GROUP_TURN_QUIET_AFTER_MS,
  shouldAnimateTurnIndicator
} from './bot-group-chat-activity'
import type { AgentStatusEntry } from './agent-status-types'

const NOW = 1_000_000

function entry(partial: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    state: 'working',
    prompt: '',
    updatedAt: NOW,
    stateStartedAt: NOW,
    paneKey: 'tab:leaf',
    stateHistory: [],
    ...partial
  } as AgentStatusEntry
}

describe('formatTurnElapsed', () => {
  it('counts up as a clock', () => {
    expect(formatTurnElapsed(0)).toBe('0:00')
    expect(formatTurnElapsed(9_000)).toBe('0:09')
    expect(formatTurnElapsed(65_000)).toBe('1:05')
    expect(formatTurnElapsed(600_000)).toBe('10:00')
  })

  it('never shows a negative clock when the clocks disagree', () => {
    expect(formatTurnElapsed(-5_000)).toBe('0:00')
  })
})

describe('describeMemberTurnActivity', () => {
  it('reports the tool the agent is running', () => {
    const activity = describeMemberTurnActivity({
      entry: entry({ toolName: 'Edit', toolInput: 'src/app.ts' }),
      now: NOW
    })
    expect(activity).toEqual({ kind: 'tool', toolName: 'Edit', detail: 'src/app.ts' })
  })

  it('falls back to plain working when no tool was reported', () => {
    expect(describeMemberTurnActivity({ entry: entry({}), now: NOW }).kind).toBe('working')
  })

  it('reports a launching session with no status yet', () => {
    expect(describeMemberTurnActivity({ entry: undefined, now: NOW }).kind).toBe('starting')
  })

  it('treats blocked and waiting as needing a person, not as progress', () => {
    expect(describeMemberTurnActivity({ entry: entry({ state: 'blocked' }), now: NOW }).kind).toBe(
      'blocked'
    )
    expect(describeMemberTurnActivity({ entry: entry({ state: 'waiting' }), now: NOW }).kind).toBe(
      'blocked'
    )
  })

  it('goes quiet once the status stops moving', () => {
    // A stale `working` row is exactly what a hung agent leaves behind, so the room must stop
    // claiming progress rather than animate forever.
    const stale = entry({ toolName: 'Bash', updatedAt: NOW - GROUP_TURN_QUIET_AFTER_MS })
    expect(describeMemberTurnActivity({ entry: stale, now: NOW }).kind).toBe('quiet')
  })

  it('keeps reporting the tool while the status is still fresh', () => {
    const fresh = entry({ toolName: 'Bash', updatedAt: NOW - GROUP_TURN_QUIET_AFTER_MS + 1 })
    expect(describeMemberTurnActivity({ entry: fresh, now: NOW }).kind).toBe('tool')
  })

  it('prefers the blocked verdict over the quiet one', () => {
    // Waiting on a human is not a stall, however long it lasts.
    const stale = entry({ state: 'blocked', updatedAt: NOW - 10 * GROUP_TURN_QUIET_AFTER_MS })
    expect(describeMemberTurnActivity({ entry: stale, now: NOW }).kind).toBe('blocked')
  })
})

describe('shouldAnimateTurnIndicator', () => {
  it('stops the animation only when the turn went quiet', () => {
    expect(shouldAnimateTurnIndicator({ kind: 'working' })).toBe(true)
    expect(shouldAnimateTurnIndicator({ kind: 'blocked' })).toBe(true)
    expect(shouldAnimateTurnIndicator({ kind: 'quiet' })).toBe(false)
  })
})

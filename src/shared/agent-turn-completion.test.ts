import { describe, expect, it } from 'vitest'
import {
  createAgentTurnObserverState,
  getAgentStateHistoryOverlap,
  isAgentTurnStillWorking,
  observeAgentTurn
} from './agent-turn-completion'
import type { AgentStateHistoryEntry, AgentStatusEntry } from './agent-status-types'

const START = 1000

function status(partial: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    state: 'working',
    prompt: '',
    updatedAt: START + 10,
    stateStartedAt: START + 10,
    paneKey: 'tab:leaf',
    stateHistory: [],
    ...partial
  } as AgentStatusEntry
}

function history(
  state: AgentStateHistoryEntry['state'],
  startedAt: number
): AgentStateHistoryEntry {
  return { state, prompt: '', startedAt }
}

describe('observeAgentTurn', () => {
  it('ignores an entry older than the submit', () => {
    const observer = createAgentTurnObserverState()
    const result = observeAgentTurn(
      observer,
      status({ state: 'done', updatedAt: START - 1 }),
      START
    )
    expect(result.done).toBe(false)
  })

  it('ignores a done that never followed a working state', () => {
    // The previous turn's `done`, still in the entry when we subscribed.
    const observer = createAgentTurnObserverState()
    const result = observeAgentTurn(observer, status({ state: 'done' }), START)
    expect(result.done).toBe(false)
  })

  it('completes on working then done, returning the assistant text', () => {
    const observer = createAgentTurnObserverState()
    expect(observeAgentTurn(observer, status({ state: 'working' }), START).done).toBe(false)
    const result = observeAgentTurn(
      observer,
      status({ state: 'done', lastAssistantMessage: 'shipped it' }),
      START
    )
    expect(result).toEqual({ done: true, text: 'shipped it' })
  })

  it('does not complete on a session-boundary done', () => {
    // Claude fires SessionStart at launch, before the prompt is even submitted.
    const observer = createAgentTurnObserverState()
    observeAgentTurn(observer, status({ state: 'working' }), START)
    const result = observeAgentTurn(
      observer,
      status({ state: 'done', sessionBoundary: true, lastAssistantMessage: 'hi' }),
      START
    )
    expect(result.done).toBe(false)
  })

  it('recovers a done that rolled into history between notifications', () => {
    const observer = createAgentTurnObserverState()
    observeAgentTurn(observer, status({ state: 'working' }), START)
    const result = observeAgentTurn(
      observer,
      status({
        state: 'working',
        stateHistory: [history('working', START + 1), history('done', START + 2)],
        lastCompletedAssistantMessage: 'late answer'
      }),
      START
    )
    expect(result).toEqual({ done: true, text: 'late answer' })
  })

  it('keeps the best text when a later snapshot reports none', () => {
    // A batched publication can fold a whole done→working turn into one notification.
    const observer = createAgentTurnObserverState()
    observeAgentTurn(observer, status({ state: 'working', lastAssistantMessage: 'partial' }), START)
    const result = observeAgentTurn(observer, status({ state: 'done' }), START)
    expect(result).toEqual({ done: true, text: 'partial' })
  })

  it('reports a completed turn with no text at all', () => {
    // The room reads this as a pass rather than stalling on an agent whose hook is quiet.
    const observer = createAgentTurnObserverState()
    observeAgentTurn(observer, status({ state: 'working' }), START)
    expect(observeAgentTurn(observer, status({ state: 'done' }), START)).toEqual({
      done: true,
      text: null
    })
  })
})

describe('getAgentStateHistoryOverlap', () => {
  it('finds the shift when the window rolled', () => {
    const previous = [history('working', 1), history('done', 2)]
    const current = [history('done', 2), history('working', 3)]
    expect(getAgentStateHistoryOverlap(previous, current)).toBe(1)
  })

  it('is zero for an unrelated history', () => {
    expect(getAgentStateHistoryOverlap([history('working', 1)], [history('done', 9)])).toBe(0)
  })
})

describe('isAgentTurnStillWorking', () => {
  it('counts blocked and waiting as in flight', () => {
    // Extending the deadline for these is what keeps a member asking a question alive.
    expect(isAgentTurnStillWorking(status({ state: 'blocked' }))).toBe(true)
    expect(isAgentTurnStillWorking(status({ state: 'waiting' }))).toBe(true)
    expect(isAgentTurnStillWorking(status({ state: 'done' }))).toBe(false)
    expect(isAgentTurnStillWorking(undefined)).toBe(false)
  })
})

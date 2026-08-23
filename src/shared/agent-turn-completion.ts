// Deciding that ONE agent turn finished, and what it said.
//
// Pure so it can be tested without a store: callers feed successive agent-status snapshots in
// and get back "still running" or "done, and here is the text".
//
// Every rule here is a failure that was actually observed in the automation lane
// (useAutomationDispatchEvents.ts) — a naive `state === 'done'` check trips all four:
//   1. a `done` that is the agent CONNECTING, not finishing (Claude fires SessionStart at
//      launch, before the prompt is even submitted);
//   2. a `done` from the turn BEFORE ours, still sitting in the entry when we subscribe;
//   3. a whole done→working turn folded into one batched publication, so `lastAssistantMessage`
//      is already cleared before any subscriber observes it;
//   4. a `done` that rolled out of the live entry into `stateHistory` between two notifications.

import type { AgentStateHistoryEntry, AgentStatusEntry } from './agent-status-types'

export type AgentTurnObserverState = {
  /** Only a turn that visibly started after we submitted counts as ours. */
  sawWorkingAfterStart: boolean
  /** Last history array we processed, to diff against the next one. */
  observedHistory: AgentStateHistoryEntry[]
  /** Best text seen so far; a later empty report must not erase it. */
  latestText: string | null
}

export function createAgentTurnObserverState(): AgentTurnObserverState {
  return { sawWorkingAfterStart: false, observedHistory: [], latestText: null }
}

export type AgentTurnObservation = { done: false } | { done: true; text: string | null }

function historyEntriesEqual(left: AgentStateHistoryEntry, right: AgentStateHistoryEntry): boolean {
  return (
    left.state === right.state &&
    left.prompt === right.prompt &&
    left.startedAt === right.startedAt &&
    left.interrupted === right.interrupted
  )
}

/**
 * How many trailing entries of `previous` the head of `current` repeats.
 *
 * The history is a bounded rolling window, so between two notifications it may have shifted
 * rather than grown. Diffing by overlap — not by length — is what makes a `done` that rolled
 * out of the live entry still observable exactly once.
 */
export function getAgentStateHistoryOverlap(
  previous: readonly AgentStateHistoryEntry[],
  current: readonly AgentStateHistoryEntry[]
): number {
  for (let overlap = Math.min(previous.length, current.length); overlap > 0; overlap -= 1) {
    const offset = previous.length - overlap
    const matches = current
      .slice(0, overlap)
      .every((entry, index) => historyEntriesEqual(entry, previous[offset + index]))
    if (matches) {
      return overlap
    }
  }
  return 0
}

/**
 * Fold one status snapshot into the observer, returning whether the turn is over.
 *
 * `startedAfter` is the moment the prompt was submitted. An entry older than that describes
 * a turn we did not start.
 */
export function observeAgentTurn(
  state: AgentTurnObserverState,
  entry: AgentStatusEntry | undefined,
  startedAfter: number
): AgentTurnObservation {
  if (!entry || entry.updatedAt < startedAfter) {
    return { done: false }
  }

  const overlap = getAgentStateHistoryOverlap(state.observedHistory, entry.stateHistory)
  for (const historical of entry.stateHistory.slice(overlap)) {
    if (historical.startedAt < startedAfter) {
      continue
    }
    if (historical.state === 'working') {
      state.sawWorkingAfterStart = true
    }
    if (historical.state === 'done' && state.sawWorkingAfterStart) {
      // This `done` already rolled out of the live entry, so its output survives only here.
      const text = entry.lastCompletedAssistantMessage?.trim() || state.latestText
      return { done: true, text: text || null }
    }
  }
  state.observedHistory = [...entry.stateHistory]

  if (entry.state === 'working') {
    state.sawWorkingAfterStart = true
  }
  const live = entry.lastAssistantMessage?.trim() || entry.lastCompletedAssistantMessage?.trim()
  if (live) {
    state.latestText = live
  }

  if (
    entry.state === 'done' &&
    // A session-boundary `done` is the agent connecting, not a completed turn.
    entry.sessionBoundary !== true &&
    state.sawWorkingAfterStart
  ) {
    return { done: true, text: state.latestText }
  }
  return { done: false }
}

/** True while the pane still reports work in flight, which extends a turn's deadline. */
export function isAgentTurnStillWorking(entry: AgentStatusEntry | undefined): boolean {
  return entry?.state === 'working' || entry?.state === 'blocked' || entry?.state === 'waiting'
}

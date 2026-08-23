// What the room shows while a member is on turn.
//
// A group turn can legitimately run for minutes without emitting a line, so a static
// "thinking…" label is indistinguishable from a hung agent — which is exactly the complaint
// this module answers. Three signals together make the difference legible: a running clock
// (time is passing), the tool the agent is actually using (work is happening), and an
// explicit quiet verdict when neither has moved for a while (something may be wrong).

import type { AgentStatusEntry } from './agent-status-types'

/** No status update for this long means the turn deserves a visibly different label.
 *  Well under the turn's own 3-minute deadline, so the room says "quiet" before it gives up. */
export const GROUP_TURN_QUIET_AFTER_MS = 45_000

/** `m:ss`, counting up. Locale-independent on purpose — it reads as a clock everywhere. */
export function formatTurnElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export type MemberTurnActivity =
  /** The agent reported a tool it is running; `detail` is the tool's own input preview. */
  | { kind: 'tool'; toolName: string; detail: string | null }
  /** Working, but nothing more specific was reported. */
  | { kind: 'working' }
  /** Waiting on a person — the room must not read this as progress. */
  | { kind: 'blocked' }
  /** Alive but silent for a while; the room says so rather than implying a hang. */
  | { kind: 'quiet' }
  /** No status for this pane at all, e.g. the session is still launching. */
  | { kind: 'starting' }

/**
 * Turn the member's live agent status into one honest line for the room.
 *
 * `quiet` outranks `working` deliberately: a stale `working` row is the exact state a hung
 * agent leaves behind, so continuing to claim progress there is the misleading case.
 */
export function describeMemberTurnActivity(args: {
  entry: AgentStatusEntry | undefined
  now: number
  quietAfterMs?: number
}): MemberTurnActivity {
  const { entry, now } = args
  const quietAfterMs = args.quietAfterMs ?? GROUP_TURN_QUIET_AFTER_MS
  if (!entry) {
    return { kind: 'starting' }
  }
  if (entry.state === 'blocked' || entry.state === 'waiting') {
    return { kind: 'blocked' }
  }
  if (now - entry.updatedAt >= quietAfterMs) {
    return { kind: 'quiet' }
  }
  const toolName = entry.toolName?.trim()
  if (toolName) {
    return { kind: 'tool', toolName, detail: entry.toolInput?.trim() || null }
  }
  return { kind: 'working' }
}

/** Whether the indicator should animate. Quiet turns stop moving — the stillness is the point. */
export function shouldAnimateTurnIndicator(activity: MemberTurnActivity): boolean {
  return activity.kind !== 'quiet'
}

// A group room is ONE ordered log that Orca owns, over bots that keep their own sessions.
//
// This is the one place the bot lane departs from "Orca has no conversation store"
// (docs/reference/bot-lane.md §5), and the departure is bounded on purpose: the room log
// records WHO SAID WHAT to the room, never the reasoning behind it. Each member's full
// transcript still belongs to its agent CLI, and the room links out to it. A room without
// its own log is not implementable — a transcript is per-session, and a room is by
// definition several sessions.
//
// The model is Hermes Bot Mode's: bounded serial round-robin, deterministic @mention
// routing, "(pass)" as silence, hard caps on every axis. Nothing here is parallel and
// nothing here is an LLM router.

/** A member speaks at most this many rounds per user send. */
export const GROUP_CHAT_MAX_ROUNDS = 3
/** Total member messages one user send may produce, across all rounds. */
export const GROUP_CHAT_MAX_MESSAGES = 10
/** Room log lines fed into a member's turn prompt. */
export const GROUP_CHAT_HISTORY_LIMIT = 24
/** Members per room. Each one is a real agent process against the user's quota. */
export const GROUP_CHAT_MAX_MEMBERS = 6
/** Retained room log length. Watermarks are indices into this array and shift with it. */
export const GROUP_CHAT_LOG_LIMIT = GROUP_CHAT_HISTORY_LIMIT * 4

export const GROUP_CHAT_NAME_MAX_LENGTH = 64

/** A user entry after a lull this long opens a synthetic thread when back-filling. */
export const GROUP_THREAD_GAP_MS = 15 * 60_000

export type BotGroupChatSpeaker =
  | { kind: 'user' }
  /** `botId` rather than a name: a rename must not orphan past entries. */
  | { kind: 'member'; botId: string; name: string }

export type BotGroupChatEntry = {
  id: string
  at: number
  from: BotGroupChatSpeaker
  text: string
  /** Thread this entry belongs to. Every entry has one; 'legacy' for back-filled logs. */
  thread: string
  /** Set when the agent's reply was read from a capped status field rather than its
   *  transcript, so the room can say so and point at the full turn. */
  truncated?: boolean
}

export type BotGroupChat = {
  /** Immutable. Member session titles derive from it, so recreating a room under the same
   *  name can never resume the old room's sessions. */
  id: string
  name: string
  /** Rooms never cross projects — a member in another checkout could not be started here. */
  projectId: string
  memberBotIds: string[]
  log: BotGroupChatEntry[]
  /** `${thread}::${botId}` → index into `log` that member has already been shown. */
  watermarks: Record<string, number>
  /** Member's room-scoped conversation pane, as `tabId:leafId`. Separate from
   *  `Bot.chatPaneKey` on purpose: the turn prompt forbids leaking 1:1 content into the
   *  room, which is only honest if the room runs in its own session. */
  memberPaneKeys: Record<string, string>
  /** Turns whose reply outlived our wait, keyed by botId. Persisted so a reply that lands
   *  after a restart is still delivered late rather than lost. */
  stranded: Record<string, BotGroupChatStrandedTurn>
  createdAt: number
  updatedAt: number
}

export type BotGroupChatStrandedTurn = {
  /** Baseline: only a reply observed after this counts as this turn's. Hermes uses a
   *  message count; Orca uses a timestamp because agent status is time-stamped, not indexed. */
  submittedAt: number
  thread: string
  paneKey: string
}

export type BotGroupChatCreateInput = {
  name: string
  projectId: string
  memberBotIds: string[]
}

export type BotGroupChatUpdateInput = Partial<
  Pick<BotGroupChat, 'name' | 'memberBotIds' | 'log' | 'watermarks' | 'memberPaneKeys' | 'stranded'>
>

/** Runtime-only drive state. Never persisted: a room reloaded mid-turn is not mid-turn. */
export type BotGroupChatRuntime = {
  /** Bumped by every user send. A running drive sees the change at its next member
   *  boundary and bails, so exactly one drive owns a room. */
  epoch: number
  running: boolean
  /** Member currently on turn. */
  turnBotId: string | null
  /** When that turn's prompt was submitted.
   *
   *  The room's only proof of life. A model turn can run minutes without producing a single
   *  visible line, and a label that says only "thinking…" is indistinguishable from a hang —
   *  a running clock is what separates the two. */
  turnStartedAt: number | null
  /** 1-based round in progress, and member messages posted so far for this send. Shown so a
   *  long room reads as bounded work with an end rather than an open-ended wait. */
  round: number
  posted: number
}

export const EMPTY_GROUP_CHAT_RUNTIME: BotGroupChatRuntime = {
  epoch: 0,
  running: false,
  turnBotId: null,
  turnStartedAt: null,
  round: 0,
  posted: 0
}

export function groupChatWatermarkKey(thread: string, botId: string): string {
  return `${thread}::${botId}`
}

/** Terminal title for a member's room-scoped session, and the key Orca re-discovers it by.
 *  Carries the room id, not its name — a same-name recreate must not adopt old sessions. */
export function groupChatSessionTitle(roomId: string, handle: string): string {
  return `bot:${handle}@${roomId}`
}

export function groupThreadOf(entry: Pick<BotGroupChatEntry, 'thread'>): string {
  return entry.thread || 'legacy'
}

/** Room membership is capped and de-duplicated; callers may pass raw selections. */
export function normalizeGroupMemberIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.filter((id) => id.trim() !== ''))).slice(0, GROUP_CHAT_MAX_MEMBERS)
}

export type GroupChatEligibility =
  | { ok: true }
  | { ok: false; reason: 'too_few_members' | 'too_many_members' | 'no_project' }

export function getGroupChatEligibility(input: {
  memberBotIds: readonly string[]
  projectId: string | null
}): GroupChatEligibility {
  if (!input.projectId) {
    return { ok: false, reason: 'no_project' }
  }
  if (input.memberBotIds.length < 2) {
    return { ok: false, reason: 'too_few_members' }
  }
  if (input.memberBotIds.length > GROUP_CHAT_MAX_MEMBERS) {
    return { ok: false, reason: 'too_many_members' }
  }
  return { ok: true }
}

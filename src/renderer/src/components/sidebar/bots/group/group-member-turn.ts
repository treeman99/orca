// One member's turn in a room: get it a room-scoped session, hand it the delta, wait.
//
// The session is deliberately NOT the bot's 1:1 pane. The turn prompt tells a member never to
// reveal its private chat into the room, which is only honest if the room runs somewhere else
// — and a user typing a follow-up into the 1:1 pane must not land in the middle of a room turn.
//
// Waiting is push-based (agent status), unlike Hermes's 2s poll, because Orca's hooks already
// publish turn boundaries. The deadline still exists for the case hooks never report at all.

import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { submitPromptToAgentPty } from '@/lib/agent-paste-draft'
import { useAppStore } from '@/store'
import { getBotRoutineEligibility, botHandle, type Bot } from '../../../../../../shared/bot-types'
import {
  groupChatSessionTitle,
  type BotGroupChat
} from '../../../../../../shared/bot-group-chat-types'
import { buildBotRoleBlock } from '../bot-message-routing'
import {
  buildGroupChatSessionPrompt,
  buildGroupChatStandbyPrompt
} from '../../../../../../shared/bot-group-chat-prompt'
import { findLiveBotChatSession } from '../bot-chat-session'
import {
  createAgentTurnObserverState,
  isAgentTurnStillWorking,
  observeAgentTurn
} from '../../../../../../shared/agent-turn-completion'
import { findAssistantReplyAfter } from '../../../../../../shared/native-chat-reply-text'

/** Base wait for one member turn. Extended while the pane still reports work. */
const TURN_TIMEOUT_MS = 180_000
/** Absolute ceiling from submit, however busy the member looks. */
const TURN_HARD_CAP_MS = 20 * 60_000

export type GroupTurnResult =
  /** The member answered (or explicitly passed — `text` is then the pass marker). */
  | { kind: 'replied'; text: string; truncated: boolean }
  /** Finished with nothing to say, or reported no text at all. */
  | { kind: 'passed' }
  /** Still running when we stopped waiting; its reply may land later. */
  | { kind: 'timed-out'; paneKey: string; submittedAt: number }
  | { kind: 'unavailable' }

function findRoomSession(room: BotGroupChat, bot: Bot, worktreeId: string) {
  return findLiveBotChatSession({
    chatPaneKey: room.memberPaneKeys[bot.id] ?? null,
    botName: bot.name,
    worktreeId,
    agentId: bot.agentId,
    state: useAppStore.getState(),
    sessionTitle: groupChatSessionTitle(room.id, botHandle(bot.name))
  })
}

/**
 * Bring up a member's room session with nothing to do yet.
 *
 * Returns the pane it landed in so the caller can persist the binding. A member that cannot
 * start is reported as a pass rather than a room error — one absent bot must not stop a room.
 */
export async function startGroupMemberStandby(
  room: BotGroupChat,
  bot: Bot
): Promise<string | null> {
  const eligibility = getBotRoutineEligibility(bot)
  if (!eligibility.ok) {
    return null
  }
  try {
    const result = await launchAgentBackgroundSession({
      agent: bot.agentId,
      worktreeId: eligibility.worktreeId,
      prompt: buildGroupChatStandbyPrompt({
        roleBlock: buildBotRoleBlock(bot),
        roomName: room.name
      }),
      title: groupChatSessionTitle(room.id, botHandle(bot.name)),
      launchSource: 'sidebar'
    })
    return result?.paneKey ?? null
  } catch {
    return null
  }
}

/** Read the member's reply from its transcript, which is not length-capped. */
async function readReplyFromTranscript(paneKey: string, after: number): Promise<string | null> {
  const entry = useAppStore.getState().agentStatusByPaneKey[paneKey]
  const session = entry?.providerSession
  const agent = entry?.agentType
  if (!session?.id || !agent) {
    return null
  }
  try {
    const result = await window.api.nativeChat.readSession(
      agent,
      session.id,
      40,
      session.transcriptPath
    )
    if ('error' in result) {
      return null
    }
    return findAssistantReplyAfter(result.messages, after)
  } catch {
    return null
  }
}

type TurnWait = { kind: 'done'; text: string | null } | { kind: 'timeout' }

/** Wait for this pane's turn to end, extending while it visibly works. */
function awaitTurnCompletion(paneKey: string, submittedAt: number): Promise<TurnWait> {
  return new Promise<TurnWait>((resolve) => {
    const observer = createAgentTurnObserverState()
    let deadline = submittedAt + TURN_TIMEOUT_MS
    let settled = false
    const finish = (value: TurnWait): void => {
      if (settled) {
        return
      }
      settled = true
      unsubscribe()
      window.clearInterval(timer)
      resolve(value)
    }
    const check = (): void => {
      const entry = useAppStore.getState().agentStatusByPaneKey[paneKey]
      const observation = observeAgentTurn(observer, entry, submittedAt)
      if (observation.done) {
        finish({ kind: 'done', text: observation.text })
        return
      }
      if (isAgentTurnStillWorking(entry)) {
        deadline = Math.min(submittedAt + TURN_HARD_CAP_MS, Date.now() + TURN_TIMEOUT_MS)
      }
    }
    const unsubscribe = useAppStore.subscribe(check)
    // A timer as well as the subscription: the deadline has to fire even when the pane goes
    // completely silent, which produces no store update to wake `check`.
    const timer = window.setInterval(() => {
      check()
      if (!settled && Date.now() >= deadline) {
        finish({ kind: 'timeout' })
      }
    }, 2000)
    check()
  })
}

/**
 * Run one member's turn to completion.
 *
 * `onPaneKey` fires as soon as a session exists, before the turn finishes, so the room can
 * persist the binding even if the turn later times out.
 */
export async function runGroupMemberTurn(args: {
  room: BotGroupChat
  bot: Bot
  prompt: string
  onPaneKey: (paneKey: string) => void
}): Promise<GroupTurnResult> {
  const { room, bot, prompt, onPaneKey } = args
  const eligibility = getBotRoutineEligibility(bot)
  if (!eligibility.ok) {
    return { kind: 'unavailable' }
  }

  const existing = findRoomSession(room, bot, eligibility.worktreeId)
  const submittedAt = Date.now()
  let paneKey: string

  if (existing) {
    paneKey = existing.paneKey
    onPaneKey(paneKey)
    const delivered = await submitPromptToAgentPty({
      tabId: existing.tabId,
      ptyId: existing.ptyId,
      content: prompt
    })
    if (!delivered) {
      return { kind: 'unavailable' }
    }
  } else {
    // First turn of this member in this room: identity, then the room and its rules.
    try {
      const launched = await launchAgentBackgroundSession({
        agent: bot.agentId,
        worktreeId: eligibility.worktreeId,
        prompt: buildGroupChatSessionPrompt({
          roleBlock: buildBotRoleBlock(bot),
          turnPrompt: prompt
        }),
        title: groupChatSessionTitle(room.id, botHandle(bot.name)),
        launchSource: 'sidebar'
      })
      if (!launched) {
        return { kind: 'unavailable' }
      }
      paneKey = launched.paneKey
      onPaneKey(paneKey)
    } catch {
      return { kind: 'unavailable' }
    }
  }

  const outcome = await awaitTurnCompletion(paneKey, submittedAt)
  if (outcome.kind === 'timeout') {
    return { kind: 'timed-out', paneKey, submittedAt }
  }

  const full = await readReplyFromTranscript(paneKey, submittedAt)
  if (full) {
    return { kind: 'replied', text: full, truncated: false }
  }
  if (outcome.text) {
    // Status text only — the transcript was unreadable for this agent, so the room shows the
    // capped preview and points at the pane for the rest.
    return { kind: 'replied', text: outcome.text, truncated: true }
  }
  return { kind: 'passed' }
}

/**
 * Try to collect a reply that landed after we stopped waiting.
 *
 * Called at the top of every round and once more in the background after a drive settles, so
 * long work is delivered late rather than lost. Returns null while the member is still busy.
 */
export async function harvestStrandedReply(args: {
  paneKey: string
  submittedAt: number
}): Promise<{ text: string; truncated: boolean } | null> {
  const entry = useAppStore.getState().agentStatusByPaneKey[args.paneKey]
  if (isAgentTurnStillWorking(entry)) {
    return null
  }
  const full = await readReplyFromTranscript(args.paneKey, args.submittedAt)
  if (full) {
    return { text: full, truncated: false }
  }
  const preview =
    entry?.lastCompletedAssistantMessage?.trim() || entry?.lastAssistantMessage?.trim()
  if (preview && (entry?.updatedAt ?? 0) >= args.submittedAt) {
    return { text: preview, truncated: true }
  }
  return null
}

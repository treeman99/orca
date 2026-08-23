// The bounded round-robin that makes a room a conversation instead of a broadcast.
//
// Serial by design — one member at a time, never parallel, no model deciding who speaks next.
// A router that picks "the best responder" has no natural stopping point; a deterministic
// mention parse plus a round cap does. Every exit is a hard cap or unanimous silence.

import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { Bot } from '../../../../../../shared/bot-types'
import {
  EMPTY_GROUP_CHAT_RUNTIME,
  GROUP_CHAT_MAX_MESSAGES,
  GROUP_CHAT_MAX_ROUNDS,
  type BotGroupChat
} from '../../../../../../shared/bot-group-chat-types'
import {
  advanceWatermark,
  appendGroupChatEntry,
  makeGroupChatEntry,
  readWatermark
} from '../../../../../../shared/bot-group-chat-log'
import {
  isGroupPassText,
  resolveGroupResponders,
  rotateGroupSpeakers,
  selectTurnDelta
} from '../../../../../../shared/bot-group-chat-turn-order'
import { buildGroupChatTurnPrompt } from '../../../../../../shared/bot-group-chat-prompt'
import { harvestStrandedReply, runGroupMemberTurn } from './group-member-turn'

/** Poll interval for replies that outlived their turn, after the drive settles. */
const HARVEST_INTERVAL_MS = 5000
const HARVEST_MAX_TRIES = 60

function readRoom(roomId: string): BotGroupChat | null {
  return useAppStore.getState().botGroupChats.find((room) => room.id === roomId) ?? null
}

function readMembers(room: BotGroupChat): Bot[] {
  const roster = useAppStore.getState().bots
  return room.memberBotIds
    .map((id) => roster.find((bot) => bot.id === id))
    .filter((bot): bot is Bot => bot !== undefined)
}

/** Post a member's reply into the room and mark it as having seen its own message. */
async function postMemberReply(args: {
  room: BotGroupChat
  bot: Bot
  thread: string
  text: string
  truncated: boolean
}): Promise<void> {
  const { bot, thread, text, truncated } = args
  const room = readRoom(args.room.id)
  if (!room) {
    return
  }
  const bounded = appendGroupChatEntry(
    { log: room.log, watermarks: room.watermarks },
    makeGroupChatEntry({
      id: createBrowserUuid(),
      at: Date.now(),
      from: { kind: 'member', botId: bot.id, name: bot.name },
      text,
      thread,
      truncated
    })
  )
  await useAppStore.getState().patchGroupChat(room.id, {
    log: bounded.log,
    watermarks: advanceWatermark(bounded.watermarks, thread, bot.id, bounded.log.length)
  })
}

/**
 * Deliver replies that finished after their turn timed out.
 *
 * Runs for every member, not just this round's responders: long work is late, never lost.
 * A member still working keeps its marker and is skipped as a responder — re-prompting a
 * live session would interrupt exactly the work this mechanism exists to protect.
 */
async function harvestRoom(roomId: string, members: readonly Bot[]): Promise<void> {
  for (const bot of members) {
    const room = readRoom(roomId)
    const marker = room?.stranded?.[bot.id]
    if (!room || !marker) {
      continue
    }
    const harvested = await harvestStrandedReply({
      paneKey: marker.paneKey,
      submittedAt: marker.submittedAt
    })
    if (!harvested) {
      continue
    }
    const { [bot.id]: _consumed, ...stranded } = room.stranded
    await useAppStore.getState().patchGroupChat(roomId, { stranded })
    if (!isGroupPassText(harvested.text)) {
      await postMemberReply({
        room,
        bot,
        thread: marker.thread,
        text: harvested.text,
        truncated: harvested.truncated
      })
    }
  }
}

/** Keep collecting late replies for a while after the drive itself has settled. */
async function harvestUntilSettled(roomId: string, members: readonly Bot[]): Promise<void> {
  for (let attempt = 0; attempt < HARVEST_MAX_TRIES; attempt++) {
    await new Promise((resolve) => window.setTimeout(resolve, HARVEST_INTERVAL_MS))
    const room = readRoom(roomId)
    const runtime = useAppStore.getState().botGroupChatRuntime[roomId]
    // A new drive harvests on its own, and a deleted room has nothing to collect into.
    if (!room || runtime?.running) {
      return
    }
    if (Object.keys(room.stranded ?? {}).length === 0) {
      return
    }
    await harvestRoom(roomId, members)
  }
}

/**
 * Drive one thread to settlement.
 *
 * Three exits, all bounded: the round cap, the message cap, and a round in which every
 * selected member passed — which means the conversation is finished, not stuck.
 */
export async function runGroupChatRounds(roomId: string, thread: string): Promise<void> {
  const store = useAppStore.getState()
  const startEpoch = (store.botGroupChatRuntime[roomId] ?? EMPTY_GROUP_CHAT_RUNTIME).epoch
  const isCurrent = (): boolean =>
    (useAppStore.getState().botGroupChatRuntime[roomId]?.epoch ?? 0) === startEpoch

  const initial = readRoom(roomId)
  if (!initial) {
    return
  }
  const members = readMembers(initial)
  let posted = 0

  try {
    for (let round = 0; round < GROUP_CHAT_MAX_ROUNDS; round++) {
      await harvestRoom(roomId, members)
      if (!isCurrent()) {
        return
      }

      const room = readRoom(roomId)
      if (!room) {
        return
      }
      const threadLog = room.log.filter((entry) => entry.thread === thread)
      const stranded = room.stranded ?? {}
      const responders = rotateGroupSpeakers(
        resolveGroupResponders(threadLog, members),
        round
      ).filter((bot) => !Object.hasOwn(stranded, bot.id))

      let spokeThisRound = 0

      for (const bot of responders) {
        if (!isCurrent() || posted >= GROUP_CHAT_MAX_MESSAGES) {
          return
        }
        const current = readRoom(roomId)
        if (!current) {
          return
        }
        const seen = readWatermark(current.watermarks, thread, bot.id)
        const delta = selectTurnDelta(current.log, seen, thread)
        if (delta.length === 0) {
          continue
        }

        // Stamped before the prompt goes out so the room's elapsed clock measures the whole
        // turn, including the launch of a member that has no session yet.
        useAppStore.getState().setGroupChatRuntime(roomId, {
          turnBotId: bot.id,
          turnStartedAt: Date.now(),
          round: round + 1
        })
        const prompt = buildGroupChatTurnPrompt({
          roomName: current.name,
          members,
          viewer: bot,
          delta
        })
        const preReplyLength = current.log.length
        const result = await runGroupMemberTurn({
          room: current,
          bot,
          prompt,
          onPaneKey: (paneKey) => {
            const room = readRoom(roomId)
            if (room && room.memberPaneKeys[bot.id] !== paneKey) {
              void useAppStore.getState().patchGroupChat(roomId, {
                memberPaneKeys: { ...room.memberPaneKeys, [bot.id]: paneKey }
              })
            }
          }
        })

        // The member has seen everything up to the pre-reply length, whatever it answered —
        // a failed or silent turn must not re-deliver the same delta next round.
        const afterTurn = readRoom(roomId)
        if (afterTurn) {
          await useAppStore.getState().patchGroupChat(roomId, {
            watermarks: advanceWatermark(afterTurn.watermarks, thread, bot.id, preReplyLength)
          })
        }

        if (result.kind === 'timed-out') {
          const room = readRoom(roomId)
          if (room) {
            await useAppStore.getState().patchGroupChat(roomId, {
              stranded: {
                ...room.stranded,
                [bot.id]: {
                  submittedAt: result.submittedAt,
                  thread,
                  paneKey: result.paneKey
                }
              }
            })
          }
          continue
        }

        if (result.kind === 'replied' && !isGroupPassText(result.text)) {
          const room = readRoom(roomId)
          if (room) {
            await postMemberReply({
              room,
              bot,
              thread,
              text: result.text,
              truncated: result.truncated
            })
            posted += 1
            spokeThisRound += 1
            useAppStore.getState().setGroupChatRuntime(roomId, { posted })
          }
        }
      }

      if (spokeThisRound === 0) {
        return
      }
    }
  } finally {
    // Only the owning drive clears the flags — a superseded one must not tell the room it
    // settled while its replacement is still working.
    if (isCurrent()) {
      useAppStore.getState().setGroupChatRuntime(roomId, {
        running: false,
        turnBotId: null,
        turnStartedAt: null
      })
      const room = readRoom(roomId)
      if (room && Object.keys(room.stranded ?? {}).length > 0) {
        void harvestUntilSettled(roomId, members)
      }
    }
  }
}

import { randomUUID } from 'node:crypto'
import {
  GROUP_CHAT_NAME_MAX_LENGTH,
  normalizeGroupMemberIds,
  type BotGroupChat,
  type BotGroupChatCreateInput,
  type BotGroupChatUpdateInput
} from '../../../shared/bot-group-chat-types'
import { assignLegacyThreads, trimGroupChatLog } from '../../../shared/bot-group-chat-log'
import type { PersistedState } from '../../../shared/persisted-state-types'
import type { StoreOwnedPersistedState } from '../loading-store/store-owned-state'

export type BotGroupChatOperations = {
  state: StoreOwnedPersistedState
  flush: () => void
}

function clamp(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

/**
 * Rooms as stored, with the log re-bounded and thread ids back-filled on read.
 *
 * Back-filling here rather than at write time keeps a hand-edited or older state file
 * readable: an entry with no thread would otherwise land in the 'legacy' bucket forever and
 * mix unrelated conversations into one member's delta.
 */
export function listBotGroupChats(state: PersistedState): BotGroupChat[] {
  return [...(state.botGroupChats ?? [])]
    .map((room) => {
      const withThreads = assignLegacyThreads(room.log ?? [])
      const bounded = trimGroupChatLog(withThreads, room.watermarks ?? {})
      return { ...room, log: bounded.log, watermarks: bounded.watermarks }
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

/**
 * A room is always FRESH.
 *
 * The id is minted here and never reused, because member session titles derive from it: a
 * room recreated under a name that was used before must not adopt the old room's sessions,
 * which would resume conversations the user believes they discarded.
 */
export function createBotGroupChat(
  operations: BotGroupChatOperations,
  input: BotGroupChatCreateInput
): BotGroupChat {
  const now = Date.now()
  const room: BotGroupChat = {
    id: randomUUID(),
    name: clamp(input.name, GROUP_CHAT_NAME_MAX_LENGTH) || 'Untitled room',
    projectId: input.projectId,
    memberBotIds: normalizeGroupMemberIds(input.memberBotIds),
    log: [],
    watermarks: {},
    memberPaneKeys: {},
    stranded: {},
    createdAt: now,
    updatedAt: now
  }
  operations.state.botGroupChats = [...(operations.state.botGroupChats ?? []), room]
  operations.flush()
  return room
}

export function updateBotGroupChat(
  operations: BotGroupChatOperations,
  id: string,
  updates: BotGroupChatUpdateInput
): BotGroupChat {
  const rooms = operations.state.botGroupChats ?? []
  const index = rooms.findIndex((entry) => entry.id === id)
  if (index === -1) {
    throw new Error('Group chat not found.')
  }
  const current = rooms[index]
  // Why: the renderer forwards a Partial verbatim, so an explicit `undefined` would
  // otherwise blank a stored field in the spread below.
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  ) as BotGroupChatUpdateInput

  const log = defined.log ?? current.log
  const watermarks = defined.watermarks ?? current.watermarks
  // Trimming on every write, not only on append: watermarks are indices into `log`, so the
  // pair must stay consistent no matter which half the caller changed.
  const bounded = trimGroupChatLog(log, watermarks)

  const updated: BotGroupChat = {
    ...current,
    ...defined,
    name:
      defined.name === undefined
        ? current.name
        : clamp(defined.name, GROUP_CHAT_NAME_MAX_LENGTH) || current.name,
    memberBotIds:
      defined.memberBotIds === undefined
        ? current.memberBotIds
        : normalizeGroupMemberIds(defined.memberBotIds),
    log: bounded.log,
    watermarks: bounded.watermarks,
    updatedAt: Date.now()
  }
  const next = [...rooms]
  next[index] = updated
  operations.state.botGroupChats = next
  operations.flush()
  return updated
}

export function deleteBotGroupChat(operations: BotGroupChatOperations, id: string): void {
  operations.state.botGroupChats = (operations.state.botGroupChats ?? []).filter(
    (entry) => entry.id !== id
  )
  operations.flush()
}

/**
 * Drop a deleted bot from every room it was in, keeping the rooms themselves.
 *
 * Same reasoning as detaching a deleted bot's routines: removing a roster entry must not
 * silently discard a conversation the user can still read. A room left with fewer than two
 * members stops driving turns and says so, rather than disappearing.
 */
export function detachBotFromGroupChats(operations: BotGroupChatOperations, botId: string): void {
  const rooms = operations.state.botGroupChats ?? []
  let changed = false
  const next = rooms.map((room) => {
    if (!room.memberBotIds.includes(botId)) {
      return room
    }
    changed = true
    const { [botId]: _removedPane, ...memberPaneKeys } = room.memberPaneKeys ?? {}
    const { [botId]: _removedStranded, ...stranded } = room.stranded ?? {}
    return {
      ...room,
      memberBotIds: room.memberBotIds.filter((id) => id !== botId),
      memberPaneKeys,
      stranded,
      updatedAt: Date.now()
    }
  })
  if (!changed) {
    return
  }
  operations.state.botGroupChats = next
  operations.flush()
}

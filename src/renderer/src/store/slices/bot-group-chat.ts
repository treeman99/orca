import type { StateCreator } from 'zustand'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AppState } from '../types'
import {
  EMPTY_GROUP_CHAT_RUNTIME,
  type BotGroupChat,
  type BotGroupChatCreateInput,
  type BotGroupChatRuntime,
  type BotGroupChatUpdateInput
} from '../../../../shared/bot-group-chat-types'
import {
  appendGroupChatEntry,
  makeGroupChatEntry,
  mintGroupThreadId
} from '../../../../shared/bot-group-chat-log'

export type BotGroupChatSlice = {
  botGroupChats: BotGroupChat[]
  botGroupChatsLoaded: boolean
  /** Drive state, keyed by room id. Never persisted: a room reloaded mid-turn is not mid-turn. */
  botGroupChatRuntime: Record<string, BotGroupChatRuntime>
  selectedGroupChatId: string | null
  fetchBotGroupChats: () => Promise<void>
  setSelectedGroupChatId: (id: string | null) => void
  createGroupChat: (input: BotGroupChatCreateInput) => Promise<BotGroupChat | null>
  deleteGroupChat: (id: string) => Promise<void>
  /** Persist a room patch and mirror it locally. The drive calls this on every turn. */
  patchGroupChat: (id: string, updates: BotGroupChatUpdateInput) => Promise<void>
  setGroupChatRuntime: (id: string, patch: Partial<BotGroupChatRuntime>) => void
  /** User send. Returns the thread the message landed in, or null when it was refused. */
  sendToGroupChat: (args: {
    roomId: string
    text: string
    thread?: string | null
  }) => Promise<string | null>
}

function reportGroupChatFailure(error: unknown): void {
  toast.error(
    translate('auto.store.slices.botGroupChat.3f7ac91e', 'Could not save the group chat.'),
    error instanceof Error ? { description: error.message } : undefined
  )
}

export const createBotGroupChatSlice: StateCreator<AppState, [], [], BotGroupChatSlice> = (
  set,
  get
) => ({
  botGroupChats: [],
  botGroupChatsLoaded: false,
  botGroupChatRuntime: {},
  selectedGroupChatId: null,

  fetchBotGroupChats: async () => {
    try {
      const rooms = await window.api.botGroupChats.list()
      set({ botGroupChats: rooms, botGroupChatsLoaded: true })
    } catch {
      // A build without the group-chat IPC surface simply shows no rooms.
      set({ botGroupChats: [], botGroupChatsLoaded: true })
    }
  },

  setSelectedGroupChatId: (id) => set({ selectedGroupChatId: id }),

  createGroupChat: async (input) => {
    try {
      const room = await window.api.botGroupChats.create(input)
      set((current) => ({ botGroupChats: [...current.botGroupChats, room] }))
      return room
    } catch (error) {
      reportGroupChatFailure(error)
      return null
    }
  },

  deleteGroupChat: async (id) => {
    try {
      await window.api.botGroupChats.delete({ id })
    } catch (error) {
      reportGroupChatFailure(error)
      return
    }
    set((current) => {
      const { [id]: _dropped, ...runtime } = current.botGroupChatRuntime
      return {
        botGroupChats: current.botGroupChats.filter((room) => room.id !== id),
        botGroupChatRuntime: runtime,
        selectedGroupChatId: current.selectedGroupChatId === id ? null : current.selectedGroupChatId
      }
    })
  },

  patchGroupChat: async (id, updates) => {
    // Optimistic: the drive reads the room back immediately to build the next turn's delta,
    // so waiting for the round-trip would feed it a stale log.
    set((current) => ({
      botGroupChats: current.botGroupChats.map((room) =>
        room.id === id ? { ...room, ...updates, updatedAt: Date.now() } : room
      )
    }))
    try {
      const saved = await window.api.botGroupChats.update({ id, updates })
      set((current) => ({
        botGroupChats: current.botGroupChats.map((room) => (room.id === id ? saved : room))
      }))
    } catch (error) {
      reportGroupChatFailure(error)
    }
  },

  setGroupChatRuntime: (id, patch) =>
    set((current) => ({
      botGroupChatRuntime: {
        ...current.botGroupChatRuntime,
        [id]: { ...(current.botGroupChatRuntime[id] ?? EMPTY_GROUP_CHAT_RUNTIME), ...patch }
      }
    })),

  sendToGroupChat: async ({ roomId, text, thread }) => {
    const body = text.trim()
    const room = get().botGroupChats.find((entry) => entry.id === roomId)
    if (!body || !room || room.memberBotIds.length < 2) {
      return null
    }
    const target =
      thread || mintGroupThreadId(Date.now(), createBrowserUuid().slice(0, 5).replace(/-/g, ''))
    const bounded = appendGroupChatEntry(
      { log: room.log, watermarks: room.watermarks },
      makeGroupChatEntry({
        id: createBrowserUuid(),
        at: Date.now(),
        from: { kind: 'user' },
        text: body,
        thread: target
      })
    )
    await get().patchGroupChat(roomId, { log: bounded.log, watermarks: bounded.watermarks })

    const runtime = get().botGroupChatRuntime[roomId] ?? EMPTY_GROUP_CHAT_RUNTIME
    const wasRunning = runtime.running
    // The epoch bump supersedes any drive already running: it notices at its next member
    // boundary and bails, so exactly one drive owns a room.
    get().setGroupChatRuntime(roomId, {
      epoch: runtime.epoch + 1,
      running: true,
      round: 0,
      posted: 0,
      turnBotId: null,
      turnStartedAt: null
    })

    // Imported at call time: the drive reaches the agent launcher, which imports this store.
    const { runGroupChatRounds } = await import('@/components/sidebar/bots/group/group-chat-drive')
    const start = (): void => {
      void runGroupChatRounds(roomId, target)
    }
    if (wasRunning) {
      // Let the outgoing drive reach its boundary first, so two loops never interleave turns.
      window.setTimeout(start, 250)
    } else {
      start()
    }
    return target
  }
})

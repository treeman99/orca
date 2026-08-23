import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import type { Bot } from '../../../../../../shared/bot-types'
import type { BotGroupChat } from '../../../../../../shared/bot-group-chat-types'

export type BotGroupLane = {
  rooms: BotGroupChat[]
  botsById: Map<string, Bot>
  runningRoomIds: string[]
  selectedRoomId: string | null
  createOpen: boolean
  setCreateOpen: (open: boolean) => void
  openRoom: (roomId: string) => void
  closeRoom: () => void
}

/**
 * Everything the bot lane needs to show rooms, in one hook.
 *
 * Bundled rather than read piecemeal in BotsPanel because that file is already at its
 * max-lines budget, and the room lane is a self-contained concern.
 */
export function useBotGroupLane(): BotGroupLane {
  const rooms = useAppStore(useShallow((state) => state.botGroupChats))
  const bots = useAppStore(useShallow((state) => state.bots))
  const runtime = useAppStore(useShallow((state) => state.botGroupChatRuntime))
  const selectedRoomId = useAppStore((state) => state.selectedGroupChatId)
  const setSelectedGroupChatId = useAppStore((state) => state.setSelectedGroupChatId)
  const setSelectedBotId = useAppStore((state) => state.setSelectedBotId)
  const fetchBotGroupChats = useAppStore((state) => state.fetchBotGroupChats)
  const loaded = useAppStore((state) => state.botGroupChatsLoaded)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (!loaded) {
      void fetchBotGroupChats()
    }
  }, [loaded, fetchBotGroupChats])

  const botsById = useMemo(() => new Map(bots.map((bot) => [bot.id, bot])), [bots])
  const runningRoomIds = useMemo(
    () =>
      Object.entries(runtime)
        .filter(([, state]) => state.running)
        .map(([roomId]) => roomId),
    [runtime]
  )

  return {
    rooms,
    botsById,
    runningRoomIds,
    selectedRoomId,
    createOpen,
    setCreateOpen,
    // Opening a room clears the bot selection: the lane shows one detail surface at a time.
    openRoom: (roomId) => {
      setSelectedBotId(null)
      setSelectedGroupChatId(roomId)
    },
    closeRoom: () => setSelectedGroupChatId(null)
  }
}

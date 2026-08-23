import React, { useEffect, useMemo, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import type { Bot } from '../../../../../../shared/bot-types'
import { EMPTY_GROUP_CHAT_RUNTIME } from '../../../../../../shared/bot-group-chat-types'
import GroupMentionInput from './GroupMentionInput'
import GroupRoomHeader from './GroupRoomHeader'
import GroupThreadList from './GroupThreadList'
import GroupTurnIndicator from './GroupTurnIndicator'
import { buildGroupThreadViews } from './group-thread-view-state'

export type GroupRoomViewProps = {
  /** Defaults to the store's selection; passed explicitly when a host owns the routing. */
  roomId?: string
  onBack?: () => void
}

/** Relative timestamps are the room's only clock, so they have to move on their own. */
const CLOCK_TICK_MS = 30_000
/** How close to the bottom still counts as "following the room". */
const STICK_TO_BOTTOM_PX = 80

function useTickingClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [])
  return now
}

/**
 * Follow the tail, but never yank a reader out of history.
 *
 * The sentinel is scrolled into view on mount and whenever the log grows — but only while
 * the viewport is already parked near the bottom, which is what separates "watching the room"
 * from "reading back through it".
 */
function useBottomAnchor(dependency: unknown): React.RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef(true)

  useEffect(() => {
    const viewport = sentinelRef.current?.closest('[data-slot="scroll-area-viewport"]')
    if (!viewport) {
      return
    }
    const onScroll = (): void => {
      stickRef.current =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < STICK_TO_BOTTOM_PX
    }
    viewport.addEventListener('scroll', onScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (stickRef.current) {
      sentinelRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [dependency])

  return sentinelRef
}

export function GroupRoomView({ roomId, onBack }: GroupRoomViewProps): React.JSX.Element | null {
  const bots = useAppStore((s) => s.bots)
  const botGroupChats = useAppStore((s) => s.botGroupChats)
  const botGroupChatRuntime = useAppStore((s) => s.botGroupChatRuntime)
  const selectedGroupChatId = useAppStore((s) => s.selectedGroupChatId)
  const setSelectedGroupChatId = useAppStore((s) => s.setSelectedGroupChatId)
  const deleteGroupChat = useAppStore((s) => s.deleteGroupChat)
  const sendToGroupChat = useAppStore((s) => s.sendToGroupChat)
  const confirm = useConfirmationDialog()

  const activeRoomId = roomId ?? selectedGroupChatId
  const room = botGroupChats.find((candidate) => candidate.id === activeRoomId) ?? null

  const [draft, setDraft] = useState('')
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({})
  const [replyThread, setReplyThread] = useState<string | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const now = useTickingClock()

  // A different room is a different conversation: nothing about the last one carries over.
  useEffect(() => {
    setDraft('')
    setOpenThreads({})
    setReplyThread(null)
    setReplyDrafts({})
  }, [activeRoomId])

  const members = useMemo<Bot[]>(() => {
    if (!room) {
      return []
    }
    return room.memberBotIds
      .map((botId) => bots.find((bot) => bot.id === botId))
      .filter((bot): bot is Bot => Boolean(bot))
  }, [room, bots])

  const membersById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members]
  )

  const threads = useMemo(
    () => buildGroupThreadViews(room?.log ?? [], openThreads),
    [room?.log, openThreads]
  )

  const runtime =
    (activeRoomId ? botGroupChatRuntime[activeRoomId] : null) ?? EMPTY_GROUP_CHAT_RUNTIME
  const sentinelRef = useBottomAnchor(
    `${room?.log.length ?? 0}:${runtime.running}:${runtime.turnBotId}`
  )

  if (!room || !activeRoomId) {
    return null
  }

  const back = (): void => {
    if (onBack) {
      onBack()
      return
    }
    setSelectedGroupChatId(null)
  }

  const submitNewThread = (): void => {
    const text = draft.trim()
    if (text === '') {
      return
    }
    setDraft('')
    void sendToGroupChat({ roomId: activeRoomId, text }).then((minted) => {
      if (minted) {
        setOpenThreads((prev) => ({ ...prev, [minted]: true }))
      }
    })
  }

  const submitReply = (thread: string): void => {
    const text = (replyDrafts[thread] ?? '').trim()
    if (text === '') {
      return
    }
    setReplyDrafts((prev) => ({ ...prev, [thread]: '' }))
    setOpenThreads((prev) => ({ ...prev, [thread]: true }))
    void sendToGroupChat({ roomId: activeRoomId, text, thread })
  }

  const handleDelete = async (): Promise<void> => {
    const confirmed = await confirm({
      title: translate(
        'auto.components.sidebar.bots.group.GroupRoomView.26e7fd48',
        'Disband this room?'
      ),
      description: translate(
        'auto.components.sidebar.bots.group.GroupRoomView.37f80e59',
        'The shared room log is deleted. The bots themselves and their own sessions are kept.'
      ),
      confirmLabel: translate(
        'auto.components.sidebar.bots.group.GroupRoomView.48091f6a',
        'Disband'
      ),
      confirmVariant: 'destructive'
    })
    if (confirmed) {
      await deleteGroupChat(activeRoomId)
      back()
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GroupRoomHeader
        room={room}
        members={members}
        onBack={back}
        // No store action renames a room yet, so the button would be inert.
        onOpenSettings={null}
        onDelete={() => void handleDelete()}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1.5 px-2 pb-2">
          {room.log.length > 0 ? (
            <GroupThreadList
              threads={threads}
              members={members}
              membersById={membersById}
              now={now}
              replyThread={replyThread}
              replyDrafts={replyDrafts}
              onToggleThread={(thread, expanded) =>
                setOpenThreads((prev) => ({ ...prev, [thread]: expanded }))
              }
              onOpenReply={setReplyThread}
              onChangeReplyDraft={(thread, text) =>
                setReplyDrafts((prev) => ({ ...prev, [thread]: text }))
              }
              onSubmitReply={submitReply}
            />
          ) : (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {translate(
                'auto.components.sidebar.bots.group.GroupRoomView.7b3c429d',
                'Say something — every bot in this room hears it.'
              )}
            </div>
          )}

          {runtime.running ? (
            <GroupTurnIndicator
              bot={runtime.turnBotId ? (membersById.get(runtime.turnBotId) ?? null) : null}
              paneKey={runtime.turnBotId ? (room.memberPaneKeys[runtime.turnBotId] ?? null) : null}
              turnStartedAt={runtime.turnStartedAt}
              round={runtime.round}
              posted={runtime.posted}
            />
          ) : null}

          <div ref={sentinelRef} aria-hidden="true" />
        </div>
      </ScrollArea>

      <form
        className="flex shrink-0 items-end gap-1.5 border-t border-border p-2"
        onSubmit={(event) => {
          event.preventDefault()
          submitNewThread()
        }}
      >
        <GroupMentionInput
          aria-label={translate(
            'auto.components.sidebar.bots.group.GroupRoomView.8c4d53ae',
            'Message this room'
          )}
          placeholder={translate(
            'auto.components.sidebar.bots.group.GroupRoomView.9d5e64bf',
            'New thread in {{value0}}… (@name to direct, @everyone for all)',
            { value0: room.name }
          )}
          members={members}
          value={draft}
          onChange={setDraft}
          onSubmitDraft={submitNewThread}
        />
        <Button type="submit" size="sm" disabled={draft.trim() === ''}>
          {translate('auto.components.sidebar.bots.group.GroupRoomView.ae6f75c0', 'New Thread')}
        </Button>
      </form>
    </div>
  )
}

export default GroupRoomView

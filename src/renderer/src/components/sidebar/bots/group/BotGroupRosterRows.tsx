import type React from 'react'
import { Loader2, Plus, Users } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Bot } from '../../../../../../shared/bot-types'
import type { BotGroupChat } from '../../../../../../shared/bot-group-chat-types'
import { BotFace } from '../bot-face/BotFace'

export type BotGroupRosterRowsProps = {
  rooms: readonly BotGroupChat[]
  botsById: ReadonlyMap<string, Bot>
  runningRoomIds: readonly string[]
  onOpenRoom: (roomId: string) => void
  onCreateRoom: () => void
  /** Rooms need two bots; below that the entry point explains itself instead of failing. */
  canCreate: boolean
}

/** Members fanned out like a Discord group-DM icon, so a room reads as a room at a glance. */
function MemberStack({ members }: { members: readonly Bot[] }): React.JSX.Element {
  if (members.length === 0) {
    return <Users className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
  }
  return (
    <div className="flex items-center -space-x-2">
      {members.slice(0, 3).map((bot) => (
        <div key={bot.id} className="ring-background rounded-full ring-2">
          <BotFace bot={bot} size={18} />
        </div>
      ))}
    </div>
  )
}

export function BotGroupRosterRows({
  rooms,
  botsById,
  runningRoomIds,
  onOpenRoom,
  onCreateRoom,
  canCreate
}: BotGroupRosterRowsProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 px-1 pb-1">
      <div className="flex h-8 items-center justify-between gap-2 px-1">
        <span className="pl-2 text-xs font-semibold text-muted-foreground/80 select-none">
          {translate('auto.components.sidebar.bots.group.roster.9a3b71cf', 'Rooms')}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!canCreate}
          onClick={onCreateRoom}
          title={
            canCreate
              ? undefined
              : translate(
                  'auto.components.sidebar.bots.group.roster.5e6d20ba',
                  'Create at least two bots in one project first.'
                )
          }
          aria-label={translate(
            'auto.components.sidebar.bots.group.roster.b41c8fd7',
            'New group chat'
          )}
        >
          <Plus className="size-3.5" strokeWidth={2.25} />
        </Button>
      </div>
      {rooms.map((room) => {
        const members = room.memberBotIds
          .map((id) => botsById.get(id))
          .filter((bot): bot is Bot => bot !== undefined)
        const running = runningRoomIds.includes(room.id)
        return (
          <button
            key={room.id}
            type="button"
            onClick={() => onOpenRoom(room.id)}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-left',
              'hover:bg-accent/50'
            )}
          >
            <MemberStack members={members} />
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
              {room.name}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[0.625rem] text-muted-foreground">
              {running ? (
                <Loader2
                  className="size-2.5 animate-spin text-primary motion-reduce:animate-none"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              ) : null}
              {running
                ? translate('auto.components.sidebar.bots.group.roster.7d1e04ab', 'working…')
                : translate(
                    'auto.components.sidebar.bots.group.roster.2c9f18de',
                    '{{value0}} bots',
                    { value0: String(members.length) }
                  )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default BotGroupRosterRows

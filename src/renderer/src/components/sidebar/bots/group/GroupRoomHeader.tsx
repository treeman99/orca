import React from 'react'
import { ChevronLeft, Settings, Trash2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Bot } from '../../../../../../shared/bot-types'
import type { BotGroupChat } from '../../../../../../shared/bot-group-chat-types'
import { BotFace } from '../bot-face/BotFace'

export type GroupRoomHeaderProps = {
  room: BotGroupChat
  members: readonly Bot[]
  onBack: () => void
  /** Null until the store can rename a room; the button is hidden rather than inert. */
  onOpenSettings: (() => void) | null
  onDelete: () => void
}

/** The roster at a glance: overlapping faces, ringed so they read as a stack, not a row. */
function MemberFaces({ members }: { members: readonly Bot[] }): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center -space-x-1.5">
      {members.map((member) => (
        <div key={member.id} className="rounded-full ring-2 ring-background">
          <BotFace bot={member} size={20} mood="idle" />
        </div>
      ))}
    </div>
  )
}

export function GroupRoomHeader({
  room,
  members,
  onBack,
  onOpenSettings,
  onDelete
}: GroupRoomHeaderProps): React.JSX.Element {
  const memberNames = members.map((member) => member.name).join(', ')

  return (
    <div className="flex h-8 shrink-0 items-center gap-2 px-2">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onBack}
        aria-label={translate(
          'auto.components.sidebar.bots.group.GroupRoomHeader.e2a3b904',
          'Back to bots'
        )}
      >
        <ChevronLeft className="size-3.5" strokeWidth={2.25} />
      </Button>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{room.name}</span>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex shrink-0 items-center gap-1.5">
            <MemberFaces members={members} />
            <span className="text-[0.65rem] text-muted-foreground">
              {translate(
                'auto.components.sidebar.bots.group.GroupRoomHeader.f3b4ca15',
                '{{value0}} bots',
                { value0: members.length }
              )}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>{memberNames}</TooltipContent>
      </Tooltip>

      {onOpenSettings ? (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onOpenSettings}
          aria-label={translate(
            'auto.components.sidebar.bots.group.GroupRoomHeader.04c5db26',
            'Room settings'
          )}
        >
          <Settings className="size-3.5" strokeWidth={2.25} />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        aria-label={translate(
          'auto.components.sidebar.bots.group.GroupRoomHeader.15d6ec37',
          'Disband this room'
        )}
      >
        <Trash2 className="size-3.5" strokeWidth={2.25} />
      </Button>
    </div>
  )
}

export default GroupRoomHeader

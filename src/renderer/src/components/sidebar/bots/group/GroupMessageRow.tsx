import React, { useState } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { botHandle, type Bot } from '../../../../../../shared/bot-types'
import type { BotGroupChatEntry } from '../../../../../../shared/bot-group-chat-types'
import { BotFace } from '../bot-face/BotFace'
import { formatGroupRelativeTime } from './group-thread-view-state'

export type GroupMessageRowProps = {
  entry: BotGroupChatEntry
  /** Resolved from `memberBotIds`; null once a member has been deleted out from under the log. */
  speaker: Bot | null
  now: number
}

/**
 * One room entry: avatar, speaker, relative time, body.
 *
 * Deliberately not a chat bubble and deliberately not grouped by speaker. A room has more
 * than two voices, so alternating sides has nothing to alternate between, and folding runs
 * of one speaker hides exactly the thing the reader is scanning for — who said this.
 */
export function GroupMessageRow({ entry, speaker, now }: GroupMessageRowProps): React.JSX.Element {
  const from = entry.from
  // Same-named bots are addressable apart by handle; revealing it is opt-in, not clutter.
  const [revealed, setRevealed] = useState(false)

  if (from.kind === 'user') {
    return (
      <div className="flex items-start gap-2 rounded-md bg-muted px-2 py-1.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[0.7rem] font-semibold text-foreground">
              {translate('auto.components.sidebar.bots.group.GroupMessageRow.0a5f31c7', 'You')}
            </span>
            <span className="text-[0.625rem] text-muted-foreground">
              {formatGroupRelativeTime(entry.at, now)}
            </span>
          </div>
          <span className="text-xs leading-snug break-words whitespace-pre-wrap">{entry.text}</span>
        </div>
      </div>
    )
  }

  const handle = botHandle(speaker?.name ?? from.name)

  return (
    <div className="flex items-start gap-2 px-2 py-1">
      <div className="mt-0.5 shrink-0">
        {speaker ? (
          <BotFace bot={speaker} size={24} mood="idle" />
        ) : (
          <span
            className="flex size-6 items-center justify-center rounded-full bg-muted text-[0.7rem] text-muted-foreground"
            aria-hidden="true"
          >
            {from.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-pointer truncate border-0 bg-transparent p-0 text-left text-[0.7rem] font-semibold text-primary"
            title={
              revealed
                ? translate(
                    'auto.components.sidebar.bots.group.GroupMessageRow.1b6e4d02',
                    'Hide the full handle'
                  )
                : translate(
                    'auto.components.sidebar.bots.group.GroupMessageRow.2c7a58f9',
                    'Show the full handle'
                  )
            }
            onClick={() => setRevealed((prev) => !prev)}
          >
            {revealed ? `${from.name} (@${handle})` : from.name}
          </button>
          <span className="shrink-0 text-[0.625rem] text-muted-foreground">
            {formatGroupRelativeTime(entry.at, now)}
          </span>
        </div>
        <span
          className={cn('text-xs leading-snug break-words whitespace-pre-wrap', {
            'text-muted-foreground italic': entry.text.trim() === ''
          })}
        >
          {entry.text.trim() === ''
            ? translate(
                'auto.components.sidebar.bots.group.GroupMessageRow.3d81b6ea',
                '(no reply text)'
              )
            : entry.text}
        </span>
        {entry.truncated ? (
          // The full turn lives in the member's own session; the room only ever had the tail.
          <span className="text-[0.625rem] text-muted-foreground">
            {translate(
              'auto.components.sidebar.bots.group.GroupMessageRow.4e92c703',
              'Clipped — open the bot session for the full turn.'
            )}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export default GroupMessageRow

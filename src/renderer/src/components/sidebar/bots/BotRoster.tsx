import type React from 'react'
import { Pencil, Plus } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Bot } from '../../../../../shared/bot-types'
import type { BotRosterGroup } from './bot-roster-groups'

export type BotRosterProps = {
  groups: readonly BotRosterGroup[]
  routineCountByBotId: Readonly<Record<string, number>>
  /** Bots another bot messaged while the user was elsewhere. */
  unreadBotIds: readonly string[]
  onSelectBot: (botId: string) => void
  /** Double-click: open the bot's conversation, starting it when there is none. */
  onOpenBotChat: (botId: string) => void
  onEditBot: (botId: string) => void
  onCreateBot: () => void
}

function BotRow({
  bot,
  routineCount,
  unread,
  onSelectBot,
  onOpenBotChat,
  onEditBot
}: {
  bot: Bot
  routineCount: number
  unread: boolean
  onSelectBot: (botId: string) => void
  onOpenBotChat: (botId: string) => void
  onEditBot: (botId: string) => void
}): React.JSX.Element {
  return (
    <li className="group/bot relative">
      <button
        type="button"
        onClick={() => onSelectBot(bot.id)}
        onDoubleClick={() => onOpenBotChat(bot.id)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-left transition-colors',
          'hover:bg-worktree-sidebar-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none'
        )}
      >
        <span className="text-base leading-none" aria-hidden="true">
          {bot.avatarEmoji}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium">{bot.name}</span>
            {unread ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-primary"
                aria-label={translate(
                  'auto.components.sidebar.bots.BotRoster.d19c0f4a83',
                  'Unread message'
                )}
              />
            ) : null}
          </span>
          {bot.title ? (
            <span className="truncate text-[11px] text-muted-foreground">{bot.title}</span>
          ) : null}
        </span>
        {routineCount > 0 ? (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {routineCount}
          </span>
        ) : null}
      </button>

      {/* Sibling, not a child: a button inside a button is invalid HTML and swallows clicks. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-hover/bot:opacity-100 focus-visible:opacity-100"
            aria-label={translate(
              'auto.components.sidebar.bots.BotRoster.61e0c3a97f',
              'Edit {{value0}}',
              { value0: bot.name }
            )}
            onClick={() => onEditBot(bot.id)}
          >
            <Pencil className="size-3" strokeWidth={2.25} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={6}>
          {translate('auto.components.sidebar.bots.BotRoster.8a1f04b6d2', 'Edit bot')}
        </TooltipContent>
      </Tooltip>
    </li>
  )
}

export function BotRoster({
  groups,
  routineCountByBotId,
  unreadBotIds,
  onSelectBot,
  onOpenBotChat,
  onEditBot,
  onCreateBot
}: BotRosterProps): React.JSX.Element {
  const isEmpty = groups.every((group) => group.bots.length === 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mt-2 flex h-8 items-center justify-between gap-2 px-2">
        <span className="pl-2 text-xs font-semibold text-muted-foreground/80 select-none">
          {translate('auto.components.sidebar.bots.BotRoster.5c81e0a72f', 'Bots')}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onCreateBot}
          aria-label={translate('auto.components.sidebar.bots.BotRoster.b09d3f61ca', 'New bot')}
        >
          <Plus className="size-3.5" strokeWidth={2.25} />
        </Button>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="text-2xl" aria-hidden="true">
            🤖
          </span>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.sidebar.bots.BotRoster.e47a2c9018',
              'No bots yet. A bot is a named agent that runs its routines on a schedule.'
            )}
          </p>
          <Button size="sm" variant="secondary" onClick={onCreateBot}>
            {translate('auto.components.sidebar.bots.BotRoster.b09d3f61ca', 'New bot')}
          </Button>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 px-2 pb-2">
            {groups.map((group) => (
              <div key={group.projectId ?? '__unassigned__'} className="flex flex-col gap-0.5">
                <span className="px-2 pt-1 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground/70 uppercase">
                  {group.label}
                </span>
                <ul className="flex flex-col gap-0.5">
                  {group.bots.map((bot) => (
                    <BotRow
                      key={bot.id}
                      bot={bot}
                      routineCount={routineCountByBotId[bot.id] ?? 0}
                      unread={unreadBotIds.includes(bot.id)}
                      onSelectBot={onSelectBot}
                      onOpenBotChat={onOpenBotChat}
                      onEditBot={onEditBot}
                    />
                  ))}
                </ul>
              </div>
            ))}
            <p className="px-2 pt-1 text-[10px] text-muted-foreground/70">
              {translate(
                'auto.components.sidebar.bots.BotRoster.2c9f0b1e74',
                'Double-click a bot to open its chat.'
              )}
            </p>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

export default BotRoster

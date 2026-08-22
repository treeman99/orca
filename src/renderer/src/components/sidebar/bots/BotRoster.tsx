import type React from 'react'
import { Plus } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { Bot } from '../../../../../shared/bot-types'

export type BotRosterProps = {
  bots: readonly Bot[]
  routineCountByBotId: Readonly<Record<string, number>>
  onSelectBot: (botId: string) => void
  onCreateBot: () => void
}

export function BotRoster({
  bots,
  routineCountByBotId,
  onSelectBot,
  onCreateBot
}: BotRosterProps): React.JSX.Element {
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

      {bots.length === 0 ? (
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
          <ul className="flex flex-col gap-0.5 px-2 pb-2">
            {bots.map((bot) => {
              const routineCount = routineCountByBotId[bot.id] ?? 0
              return (
                <li key={bot.id}>
                  <button
                    type="button"
                    onClick={() => onSelectBot(bot.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                      'hover:bg-worktree-sidebar-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none'
                    )}
                  >
                    <span className="text-base leading-none" aria-hidden="true">
                      {bot.avatarEmoji}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-medium">{bot.name}</span>
                      {bot.title ? (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {bot.title}
                        </span>
                      ) : null}
                    </span>
                    {routineCount > 0 ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {routineCount}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </ScrollArea>
      )}
    </div>
  )
}

export default BotRoster

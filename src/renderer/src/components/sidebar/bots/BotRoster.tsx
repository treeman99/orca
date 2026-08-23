import React from 'react'
import { ChevronDown, ChevronRight, Folder, Hourglass, Plus, SlidersHorizontal } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Bot } from '../../../../../shared/bot-types'
import { AgentStateDot } from '@/components/AgentStateDot'
import type { BotRosterActivity } from './bot-roster-activity'
import type { BotRosterGroup } from './bot-roster-groups'
import { BotFace } from './bot-face/BotFace'

export type BotRosterProps = {
  groups: readonly BotRosterGroup[]
  routineCountByBotId: Readonly<Record<string, number>>
  /** Bots another bot messaged while the user was elsewhere. */
  unreadBotIds: readonly string[]
  activityByBotId: Readonly<Record<string, BotRosterActivity>>
  /** Open the bot's own screen — routines, settings summary, and the message box. */
  onOpenBotDetail: (botId: string) => void
  /** Double-click: reveal the bot's agent pane in the main area, starting it when needed. */
  onOpenBotChat: (botId: string) => void
  collapsedProjectIds: readonly string[]
  onToggleProject: (projectKey: string) => void
  onCreateBot: () => void
}

/** Group key for the bucket of bots with no project; `projectId` is null there. */
const UNASSIGNED_GROUP_KEY = '__unassigned__'

// Why a timer instead of acting on `onClick` directly: the single-click handler navigates
// away, which unmounts this row before the browser can deliver `dblclick`. The double-click
// then never fires at all. Holding the single action for one interval lets the second click
// cancel it, so both gestures work on the same row.
const DOUBLE_CLICK_WINDOW_MS = 220

/**
 * Only `working` and `waiting` draw anything.
 *
 * `AgentStateDot`'s own `waiting` means "waiting for the USER", which is a different thing
 * from "blocked on a teammate" — reusing it would say the wrong word. The spinner is shared
 * so a busy bot reads exactly like a busy session elsewhere in the app.
 */
function BotActivityIcon({ activity }: { activity: BotRosterActivity }): React.JSX.Element | null {
  if (activity === 'working') {
    return <AgentStateDot state="working" size="sm" className="mt-0.5" />
  }
  if (activity === 'waiting') {
    return (
      <Hourglass
        className="mt-0.5 size-3 shrink-0 text-muted-foreground"
        strokeWidth={2}
        aria-label={translate(
          'auto.components.sidebar.bots.BotRoster.f2b70c419e',
          'Waiting for a teammate'
        )}
      />
    )
  }
  return null
}

function BotRow({
  bot,
  routineCount,
  unread,
  activity,
  onOpenBotDetail,
  onOpenBotChat
}: {
  bot: Bot
  routineCount: number
  unread: boolean
  activity: BotRosterActivity
  onOpenBotDetail: (botId: string) => void
  onOpenBotChat: (botId: string) => void
}): React.JSX.Element {
  const pendingRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(
    () => () => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current)
      }
    },
    []
  )

  const handleClick = (): void => {
    if (pendingRef.current) {
      clearTimeout(pendingRef.current)
    }
    pendingRef.current = setTimeout(() => {
      pendingRef.current = null
      onOpenBotDetail(bot.id)
    }, DOUBLE_CLICK_WINDOW_MS)
  }

  const handleDoubleClick = (): void => {
    if (pendingRef.current) {
      clearTimeout(pendingRef.current)
      pendingRef.current = null
    }
    onOpenBotChat(bot.id)
  }

  return (
    <li className="group/bot relative">
      <button
        type="button"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className={cn(
          // items-start, not items-center: once the role wraps, centering pushes the avatar
          // to the middle of a tall block instead of beside the name it belongs to.
          'flex w-full items-start gap-2 rounded-md py-1.5 pr-8 pl-2 text-left transition-colors',
          'hover:bg-worktree-sidebar-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none'
        )}
      >
        <span className="mt-px shrink-0" aria-hidden="true">
          <BotFace bot={bot} size={20} mood={activity === 'working' ? 'work' : 'idle'} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-start gap-1.5">
            <span className="min-w-0 flex-1 text-[13px] leading-snug font-medium break-words">
              {bot.name}
            </span>
            {unread ? (
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                aria-label={translate(
                  'auto.components.sidebar.bots.BotRoster.d19c0f4a83',
                  'Unread message'
                )}
              />
            ) : null}
          </span>
          {bot.title ? (
            <span className="text-[11px] leading-snug break-words text-muted-foreground">
              {bot.title}
            </span>
          ) : null}
        </span>
        <BotActivityIcon activity={activity} />
        {routineCount > 0 ? (
          <span className="mt-px shrink-0 text-[11px] tabular-nums text-muted-foreground">
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
            className="absolute top-1 right-1 opacity-0 transition-opacity group-hover/bot:opacity-100 focus-visible:opacity-100"
            aria-label={translate(
              'auto.components.sidebar.bots.BotRoster.61e0c3a97f',
              'Open {{value0}}',
              { value0: bot.name }
            )}
            onClick={() => onOpenBotDetail(bot.id)}
          >
            <SlidersHorizontal className="size-3" strokeWidth={2.25} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={6}>
          {translate('auto.components.sidebar.bots.BotRoster.8a1f04b6d2', 'Routines and settings')}
        </TooltipContent>
      </Tooltip>
    </li>
  )
}

export function BotRoster({
  groups,
  routineCountByBotId,
  unreadBotIds,
  activityByBotId,
  onOpenBotDetail,
  onOpenBotChat,
  collapsedProjectIds,
  onToggleProject,
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
            {groups.map((group) => {
              const groupKey = group.projectId ?? UNASSIGNED_GROUP_KEY
              const collapsed = collapsedProjectIds.includes(groupKey)
              const unreadInGroup = group.bots.some((bot) => unreadBotIds.includes(bot.id))
              // Collapsing must not hide that work is running inside the group.
              const busyInGroup = group.bots.some(
                (bot) =>
                  activityByBotId[bot.id] === 'working' || activityByBotId[bot.id] === 'waiting'
              )
              return (
                <div key={groupKey} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => onToggleProject(groupKey)}
                    aria-expanded={!collapsed}
                    className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-worktree-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {collapsed ? (
                      <ChevronRight
                        className="size-3 shrink-0 text-muted-foreground"
                        strokeWidth={2.5}
                      />
                    ) : (
                      <ChevronDown
                        className="size-3 shrink-0 text-muted-foreground"
                        strokeWidth={2.5}
                      />
                    )}
                    <Folder
                      className="mt-px size-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={2}
                    />
                    <span className="min-w-0 flex-1 text-[12px] leading-snug font-semibold break-words">
                      {group.label}
                    </span>
                    {collapsed && busyInGroup ? (
                      <BotActivityIcon
                        activity={
                          group.bots.some((bot) => activityByBotId[bot.id] === 'working')
                            ? 'working'
                            : 'waiting'
                        }
                      />
                    ) : null}
                    {collapsed && unreadInGroup ? (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                      {group.bots.length}
                    </span>
                  </button>

                  {/* Indented behind a rail: the bots read as belonging TO the project above,
                      not as siblings of it. Without this the two levels sat at one indent and
                      a project header looked like another roster row. */}
                  {collapsed ? null : (
                    <ul className="ml-[13px] flex flex-col gap-0.5 border-l border-border/60 py-0.5 pl-1.5">
                      {group.bots.map((bot) => (
                        <BotRow
                          key={bot.id}
                          bot={bot}
                          routineCount={routineCountByBotId[bot.id] ?? 0}
                          unread={unreadBotIds.includes(bot.id)}
                          activity={activityByBotId[bot.id] ?? 'offline'}
                          onOpenBotDetail={onOpenBotDetail}
                          onOpenBotChat={onOpenBotChat}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
            <p className="px-2 pt-1 text-[10px] text-muted-foreground/70">
              {translate(
                'auto.components.sidebar.bots.BotRoster.2c9f0b1e74',
                'Click for routines and settings · double-click to open its agent session'
              )}
            </p>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

export default BotRoster

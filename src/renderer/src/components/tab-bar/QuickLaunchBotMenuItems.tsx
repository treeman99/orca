// The chat half of the `+` menu.
//
// The agent rows above always open a raw terminal, so this is where the chat view is chosen
// on purpose rather than by a setting nobody can see from the menu. A chat needs a bot: the
// view renders an agent's transcript, and a bot is the thing that owns one.
//
// Scoped to the worktree's PROJECT, not the worktree: bots bind to a project's main checkout,
// so a feature worktree of the same repo must still list them.

import React, { useEffect, useMemo } from 'react'
import { translate } from '@/i18n/i18n'
import { DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { BotFace } from '@/components/sidebar/bots/bot-face/BotFace'
import { openBotConversation } from '@/components/sidebar/bots/open-bot-conversation'
import { getBotRoutineEligibility } from '../../../../shared/bot-types'

export type QuickLaunchBotMenuItemsProps = {
  worktreeId: string
  onFocusTerminal: (tabId: string) => void
}

function QuickLaunchBotMenuItemsInner({
  worktreeId,
  onFocusTerminal
}: QuickLaunchBotMenuItemsProps): React.JSX.Element | null {
  const bots = useAppStore((store) => store.bots)
  const botsLoaded = useAppStore((store) => store.botsLoaded)
  const fetchBots = useAppStore((store) => store.fetchBots)
  const projectId = useAppStore((store) => store.getKnownWorktreeById(worktreeId)?.repoId ?? null)

  // The roster is lazy — without this the menu is empty until the Bots lane has been opened
  // once, which reads as "this project has no bots".
  useEffect(() => {
    if (!botsLoaded) {
      void fetchBots()
    }
  }, [botsLoaded, fetchBots])

  const projectBots = useMemo(
    () =>
      projectId === null
        ? []
        : bots
            .filter((bot) => bot.projectId === projectId && getBotRoutineEligibility(bot).ok)
            .sort((left, right) => left.name.localeCompare(right.name)),
    [bots, projectId]
  )

  if (projectId === null) {
    return null
  }

  return (
    <>
      <DropdownMenuLabel className="px-2 py-1 text-[11px] leading-4 font-normal text-muted-foreground">
        {translate(
          'auto.components.tab.bar.QuickLaunchBotMenuItems.8d7334a6cd',
          'Bot conversations'
        )}
      </DropdownMenuLabel>
      {projectBots.length === 0 ? (
        <DropdownMenuItem
          disabled
          className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 text-muted-foreground"
        >
          {translate(
            'auto.components.tab.bar.QuickLaunchBotMenuItems.eee5681160',
            'No bots in this project yet'
          )}
        </DropdownMenuItem>
      ) : null}
      {projectBots.map((bot) => (
        <DropdownMenuItem
          key={bot.id}
          onSelect={() => {
            void openBotConversation(bot.id).then((result) => {
              if (result.ok) {
                onFocusTerminal(result.tabId)
              }
            })
          }}
          className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
          title={translate(
            'auto.components.tab.bar.QuickLaunchBotMenuItems.8edd565f88',
            'Open {{value0}} as a chat',
            { value0: bot.name }
          )}
        >
          <BotFace bot={bot} size={14} />
          <span className="flex-1 truncate">{bot.name}</span>
        </DropdownMenuItem>
      ))}
    </>
  )
}

export const QuickLaunchBotMenuItems = React.memo(QuickLaunchBotMenuItemsInner)

import React, { useEffect, useState } from 'react'
import { Loader2, PauseCircle, Wrench } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { Bot } from '../../../../../../shared/bot-types'
import {
  GROUP_CHAT_MAX_MESSAGES,
  GROUP_CHAT_MAX_ROUNDS
} from '../../../../../../shared/bot-group-chat-types'
import {
  describeMemberTurnActivity,
  formatTurnElapsed,
  shouldAnimateTurnIndicator,
  type MemberTurnActivity
} from '../../../../../../shared/bot-group-chat-activity'
import { BotFace } from '../bot-face/BotFace'

export type GroupTurnIndicatorProps = {
  /** Member on turn, or null while the drive is between members. */
  bot: Bot | null
  /** Pane running this turn, for reading live agent status. */
  paneKey: string | null
  turnStartedAt: number | null
  round: number
  posted: number
}

/** The elapsed clock is the proof of life, so it has to tick on its own. */
function useSecondsTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) {
      return
    }
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function activityLabel(activity: MemberTurnActivity, botName: string): string {
  switch (activity.kind) {
    case 'tool':
      return activity.detail
        ? translate(
            'auto.components.sidebar.bots.group.GroupTurnIndicator.4b1e7a02',
            '{{value0}} · {{value1}}',
            { value0: activity.toolName, value1: activity.detail }
          )
        : activity.toolName
    case 'blocked':
      return translate(
        'auto.components.sidebar.bots.group.GroupTurnIndicator.c73d1f95',
        'Waiting for your answer'
      )
    case 'quiet':
      return translate(
        'auto.components.sidebar.bots.group.GroupTurnIndicator.9e40b6d1',
        'No update yet — still waiting'
      )
    case 'starting':
      return translate(
        'auto.components.sidebar.bots.group.GroupTurnIndicator.2a8c5be7',
        'Starting the session'
      )
    case 'working':
      return translate(
        'auto.components.sidebar.bots.group.GroupTurnIndicator.7f3ad418',
        '{{value0}} is thinking',
        { value0: botName }
      )
  }
}

function ActivityIcon({
  activity,
  animate
}: {
  activity: MemberTurnActivity
  animate: boolean
}): React.JSX.Element {
  if (activity.kind === 'quiet') {
    return (
      <PauseCircle className="size-3 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
    )
  }
  if (activity.kind === 'tool') {
    return <Wrench className="size-3 shrink-0 text-primary" strokeWidth={2} aria-hidden />
  }
  return (
    <Loader2
      className={cn(
        'size-3 shrink-0 text-primary',
        // motion-reduce keeps the icon (state is still legible) without the spin.
        animate && 'animate-spin motion-reduce:animate-none'
      )}
      strokeWidth={2}
      aria-hidden
    />
  )
}

/**
 * Live proof that a turn is running.
 *
 * A group turn can go minutes without a visible line, so a static label reads as a hang. Four
 * signals answer that: the member's own face animating, a spinner, a counting clock, and the
 * tool the agent reported. When the status stops moving the indicator deliberately goes still
 * and says so, instead of animating over a stall.
 */
export function GroupTurnIndicator({
  bot,
  paneKey,
  turnStartedAt,
  round,
  posted
}: GroupTurnIndicatorProps): React.JSX.Element {
  const entry = useAppStore((state) => (paneKey ? state.agentStatusByPaneKey[paneKey] : undefined))
  const now = useSecondsTick(true)
  const activity = describeMemberTurnActivity({ entry, now })
  const animate = shouldAnimateTurnIndicator(activity)
  const botName =
    bot?.name ??
    translate('auto.components.sidebar.bots.group.GroupTurnIndicator.5d92c108', 'The room')

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5"
      role="status"
      aria-live="polite"
      aria-label={translate(
        'auto.components.sidebar.bots.group.GroupTurnIndicator.b6e1f720',
        '{{value0}} is taking a turn',
        { value0: botName }
      )}
    >
      {bot ? (
        <span className="shrink-0" aria-hidden>
          <BotFace bot={bot} size={20} mood={animate ? 'work' : 'idle'} />
        </span>
      ) : null}

      <ActivityIcon activity={activity} animate={animate} />

      <span className="min-w-0 flex-1 truncate text-[0.7rem] text-muted-foreground">
        <span className={cn(activity.kind === 'quiet' && 'text-muted-foreground/70')}>
          {activityLabel(activity, botName)}
        </span>
      </span>

      {turnStartedAt ? (
        <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground tabular-nums">
          {formatTurnElapsed(now - turnStartedAt)}
        </span>
      ) : null}

      <span className="shrink-0 text-[0.625rem] text-muted-foreground/70">
        {translate(
          'auto.components.sidebar.bots.group.GroupTurnIndicator.e14a7d63',
          'round {{value0}}/{{value1}} · {{value2}}/{{value3}} replies',
          {
            value0: String(Math.max(1, round)),
            value1: String(GROUP_CHAT_MAX_ROUNDS),
            value2: String(posted),
            value3: String(GROUP_CHAT_MAX_MESSAGES)
          }
        )}
      </span>
    </div>
  )
}

export default GroupTurnIndicator

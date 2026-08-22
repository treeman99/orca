import type React from 'react'
import { ArrowLeftRight, CornerDownRight, TriangleAlert } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { BotChatEntry } from '@/store/slices/bot-chat'

export type BotChatThreadProps = {
  entries: readonly BotChatEntry[]
  /** The agent's newest reply, read from its live status rather than a stored transcript. */
  latestReply: string | null
  botName: string
  working: boolean
}

function EntryIcon({ kind }: { kind: BotChatEntry['kind'] }): React.JSX.Element | null {
  if (kind === 'relayed-out') {
    return <ArrowLeftRight className="mt-0.5 size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
  }
  if (kind === 'relayed-in') {
    return <CornerDownRight className="mt-0.5 size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
  }
  if (kind === 'error') {
    return <TriangleAlert className="mt-0.5 size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
  }
  return null
}

export function BotChatThread({
  entries,
  latestReply,
  botName,
  working
}: BotChatThreadProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={cn(
            'flex gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] leading-snug',
            entry.kind === 'error'
              ? 'bg-destructive/10 text-destructive'
              : entry.kind === 'relayed-in'
                ? 'bg-muted/60'
                : 'bg-primary/10'
          )}
        >
          <EntryIcon kind={entry.kind} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {entry.counterpartName ? (
              <span className="text-[10px] text-muted-foreground">
                {entry.kind === 'relayed-out'
                  ? translate(
                      'auto.components.sidebar.bots.BotChatThread.4d0a71e3b9',
                      'Handed to {{value0}}',
                      { value0: entry.counterpartName }
                    )
                  : translate(
                      'auto.components.sidebar.bots.BotChatThread.b2e61c0da7',
                      'From {{value0}}',
                      { value0: entry.counterpartName }
                    )}
              </span>
            ) : null}
            <span className="break-words whitespace-pre-wrap">{entry.text}</span>
            {entry.kind === 'error' ? (
              <span className="text-[10px]">
                {translate(
                  'auto.components.sidebar.bots.BotChatThread.7c31e08fa4',
                  'Not delivered.'
                )}
              </span>
            ) : null}
          </div>
        </div>
      ))}

      {working ? (
        <div className="px-2.5 py-1 text-[11px] text-muted-foreground">
          {translate(
            'auto.components.sidebar.bots.BotChatThread.90fb4a2c16',
            '{{value0}} is working…',
            {
              value0: botName
            }
          )}
        </div>
      ) : null}

      {latestReply ? (
        <div className="flex flex-col gap-0.5 rounded-md bg-muted/60 px-2.5 py-1.5">
          <span className="text-[10px] text-muted-foreground">
            {translate(
              'auto.components.sidebar.bots.BotChatThread.5a90c7e412',
              '{{value0}} replied',
              {
                value0: botName
              }
            )}
          </span>
          {/* The agent's own transcript is the full record; this is its newest turn only. */}
          <span className="line-clamp-6 text-[12px] leading-snug break-words whitespace-pre-wrap">
            {latestReply}
          </span>
        </div>
      ) : null}
    </div>
  )
}

export default BotChatThread

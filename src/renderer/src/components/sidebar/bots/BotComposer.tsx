import React, { useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { botHandle, type Bot } from '../../../../../shared/bot-types'

export type BotComposerProps = {
  bot: Bot
  /** Other bots, for the @handle hint under the field. */
  teammates: readonly Bot[]
  sending: boolean
  disabledReason: string | null
  onSend: (text: string) => Promise<void>
}

export function BotComposer({
  bot,
  teammates,
  sending,
  disabledReason,
  onSend
}: BotComposerProps): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const canSend = draft.trim().length > 0 && !sending && !disabledReason

  const submit = async (): Promise<void> => {
    if (!canSend) {
      return
    }
    const text = draft
    // Clear first: a slow launch must not look like the message was dropped, and the
    // failure path records the text in the thread anyway.
    setDraft('')
    await onSend(text)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        value={draft}
        rows={3}
        disabled={Boolean(disabledReason)}
        placeholder={
          disabledReason ??
          translate(
            'auto.components.sidebar.bots.BotComposer.6a1f03c9d8',
            'Tell {{value0}} what to do…',
            { value0: bot.name }
          )
        }
        aria-label={translate(
          'auto.components.sidebar.bots.BotComposer.d70b28c145',
          'Message this bot'
        )}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter breaks the line — the composer convention everywhere
          // else in this app, and the reason the field is not a plain input.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submit()
          }
        }}
        className="min-h-16 resize-none text-[12px]"
      />
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
          {teammates.length > 0
            ? translate(
                'auto.components.sidebar.bots.BotComposer.3e0c95b1af',
                'Start with @{{value0}} to hand the work to another bot',
                { value0: botHandle(teammates[0].name) }
              )
            : translate(
                'auto.components.sidebar.bots.BotComposer.0f4b7ac621',
                'Enter to send, Shift+Enter for a new line'
              )}
        </span>
        <Button size="sm" disabled={!canSend} onClick={() => void submit()}>
          <SendHorizontal className="size-3.5" strokeWidth={2.25} />
          {translate('auto.components.sidebar.bots.BotComposer.b81e2f5093', 'Send')}
        </Button>
      </div>
    </div>
  )
}

export default BotComposer

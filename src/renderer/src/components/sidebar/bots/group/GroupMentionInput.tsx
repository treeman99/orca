import React, { useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Bot } from '../../../../../../shared/bot-types'
import {
  buildMentionOptions,
  insertMention,
  mentionTokenAt,
  type GroupMentionToken
} from './group-mention-tokenizer'

export type GroupMentionInputProps = Omit<
  React.ComponentProps<typeof Textarea>,
  'value' | 'onChange'
> & {
  members: readonly Bot[]
  value: string
  onChange: (text: string) => void
  onSubmitDraft: () => void
}

/**
 * The room composer field: a one-row textarea with a member-scoped @-completion popover.
 *
 * The popover opens UPWARD. Both composers sit at the bottom of their container — the main
 * one against the panel edge, a reply box against the next thread — so a downward list would
 * open off-screen exactly when it is needed.
 */
export function GroupMentionInput({
  members,
  value,
  onChange,
  onSubmitDraft,
  className,
  ...textareaProps
}: GroupMentionInputProps): React.JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [token, setToken] = useState<GroupMentionToken | null>(null)
  const [selected, setSelected] = useState(0)

  const options = buildMentionOptions(token, members)
  const open = token !== null && options.length > 0
  const active = open ? Math.min(selected, options.length - 1) : 0

  const refreshToken = (target: HTMLTextAreaElement): void => {
    setToken(mentionTokenAt(target.value, target.selectionStart ?? target.value.length))
    setSelected(0)
  }

  const insert = (handle: string): void => {
    if (!token) {
      return
    }
    const next = insertMention({
      value,
      caret: inputRef.current?.selectionStart ?? value.length,
      token,
      handle
    })
    onChange(next.text)
    setToken(null)
    // The value lands on the next render, so the caret can only be restored after it.
    requestAnimationFrame(() => {
      const element = inputRef.current
      if (!element) {
        return
      }
      element.focus()
      element.setSelectionRange(next.caret, next.caret)
    })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelected((active + 1) % options.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelected((active - 1 + options.length) % options.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        insert(options[active].handle)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setToken(null)
        return
      }
    }
    // Enter sends, Shift+Enter breaks the line — but only once the popover is out of the way.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSubmitDraft()
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      {open ? (
        <div className="scrollbar-sleek absolute bottom-full left-0 z-50 mb-1 max-h-48 w-64 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md">
          {options.map((option, index) => (
            <button
              key={option.kind === 'member' ? `member:${option.botId}` : `all:${option.handle}`}
              type="button"
              className={cn(
                'flex w-full cursor-pointer items-baseline gap-2 px-2 py-1 text-left text-xs',
                index === active ? 'bg-accent text-accent-foreground' : 'text-popover-foreground'
              )}
              // Keep focus in the field so the caret restore below has somewhere to land.
              onMouseDown={(event) => {
                event.preventDefault()
                insert(option.handle)
              }}
              onMouseEnter={() => setSelected(index)}
            >
              <span className="shrink-0 font-medium">{`@${option.handle}`}</span>
              <span className="truncate text-[0.65rem] text-muted-foreground">
                {option.kind === 'everyone'
                  ? translate(
                      'auto.components.sidebar.bots.group.GroupMentionInput.5f1a08d3',
                      'Every bot in the room'
                    )
                  : option.title || option.name}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <Textarea
        {...textareaProps}
        ref={inputRef}
        value={value}
        rows={1}
        className={cn('max-h-40 min-h-9 resize-none py-1.5 text-xs', className)}
        onChange={(event) => {
          onChange(event.target.value)
          refreshToken(event.target)
        }}
        onClick={(event) => refreshToken(event.currentTarget)}
        onKeyUp={(event) => {
          // Arrow keys move the caret without firing change, so the token can go stale.
          if (event.key.startsWith('Arrow') && !open) {
            refreshToken(event.currentTarget)
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setToken(null)}
      />
    </div>
  )
}

export default GroupMentionInput

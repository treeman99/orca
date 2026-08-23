import React, { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { botHandle, type Bot } from '../../../../../../shared/bot-types'
import {
  GROUP_CHAT_MAX_MEMBERS,
  GROUP_CHAT_NAME_MAX_LENGTH
} from '../../../../../../shared/bot-group-chat-types'
import { BotFace } from '../bot-face/BotFace'

export type CreateGroupChatDialogProps = {
  open: boolean
  /** Rooms never cross projects — a member in another checkout could not be started here. */
  projectId: string | null
  onOpenChange: (open: boolean) => void
  onCreated?: (roomId: string) => void
}

function matchesSearch(bot: Bot, query: string): boolean {
  if (query === '') {
    return true
  }
  return [bot.name, bot.title, botHandle(bot.name)].some((field) =>
    field.toLowerCase().includes(query)
  )
}

export function CreateGroupChatDialog({
  open,
  projectId,
  onOpenChange,
  onCreated
}: CreateGroupChatDialogProps): React.JSX.Element {
  const bots = useAppStore((s) => s.bots)
  const createGroupChat = useAppStore((s) => s.createGroupChat)

  const [query, setQuery] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  // Reset per open so a cancelled draft never leaks into the next one.
  useEffect(() => {
    if (open) {
      setQuery('')
      setChecked({})
      setName('')
      setCreating(false)
    }
  }, [open])

  const candidates = useMemo(
    () => (projectId ? bots.filter((bot) => bot.projectId === projectId) : []),
    [bots, projectId]
  )
  const selected = candidates.filter((bot) => checked[bot.id])
  const visible = candidates.filter((bot) => matchesSearch(bot, query.trim().toLowerCase()))
  const atCap = selected.length >= GROUP_CHAT_MAX_MEMBERS
  // An empty field means "use what the placeholder already shows", so it is the value too.
  const placeholder =
    selected.length > 0
      ? selected.map((bot) => bot.name).join(', ')
      : translate('auto.components.sidebar.bots.group.CreateGroupChatDialog.bf816ad1', 'Room name')

  const create = async (): Promise<void> => {
    const base = (name.trim() || placeholder).slice(0, GROUP_CHAT_NAME_MAX_LENGTH)
    if (!projectId || selected.length < 2 || base === '' || creating) {
      return
    }
    setCreating(true)
    try {
      const room = await createGroupChat({
        name: base,
        projectId,
        memberBotIds: selected.map((bot) => bot.id)
      })
      if (room) {
        onOpenChange(false)
        onCreated?.(room.id)
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.sidebar.bots.group.CreateGroupChatDialog.c092bbe2',
              'New group chat'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.bots.group.CreateGroupChatDialog.d1a3ccf3',
              'Pick 2–{{value0}} bots. Every member is a real agent process against your quota, and a room never crosses projects.',
              { value0: GROUP_CHAT_MAX_MEMBERS }
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2}
            aria-hidden="true"
          />
          <Input
            autoFocus
            className="h-8 pl-7 text-xs"
            placeholder={translate(
              'auto.components.sidebar.bots.group.CreateGroupChatDialog.e2b4ddf4',
              'Search bots to add…'
            )}
            aria-label={translate(
              'auto.components.sidebar.bots.group.CreateGroupChatDialog.f3c5eef5',
              'Search bots to add'
            )}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {selected.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {selected.map((bot) => (
              <button
                key={bot.id}
                type="button"
                className="flex cursor-pointer items-center gap-1 rounded-full bg-secondary py-0.5 pr-1.5 pl-2 text-[0.6875rem] text-secondary-foreground transition-colors hover:bg-accent"
                title={translate(
                  'auto.components.sidebar.bots.group.CreateGroupChatDialog.04d6fff6',
                  'Remove from selection'
                )}
                onClick={() => setChecked((prev) => ({ ...prev, [bot.id]: false }))}
              >
                {bot.name}
                <X className="size-2.5" strokeWidth={2.5} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}

        <ScrollArea className="max-h-64 min-h-0">
          <div className="grid gap-0.5 pr-2">
            {visible.length > 0 ? (
              visible.map((bot) => {
                const isChecked = Boolean(checked[bot.id])
                const disabled = !isChecked && atCap
                return (
                  <label
                    key={bot.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent',
                      disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                    )}
                  >
                    <BotFace bot={bot} size={24} mood="idle" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-foreground">{bot.name}</div>
                      <div className="truncate text-[0.625rem] text-muted-foreground">
                        {bot.title.trim()
                          ? `@${botHandle(bot.name)} · ${bot.title.trim()}`
                          : `@${botHandle(bot.name)}`}
                      </div>
                    </div>
                    <Checkbox
                      checked={isChecked}
                      disabled={disabled}
                      onCheckedChange={(value) =>
                        setChecked((prev) => ({ ...prev, [bot.id]: value === true }))
                      }
                    />
                  </label>
                )
              })
            ) : (
              <div className="px-1.5 py-3 text-center text-xs text-muted-foreground">
                {!projectId
                  ? translate(
                      'auto.components.sidebar.bots.group.CreateGroupChatDialog.15e70007',
                      'Pick a project first — a room is scoped to one checkout.'
                    )
                  : query.trim()
                    ? translate(
                        'auto.components.sidebar.bots.group.CreateGroupChatDialog.26f81118',
                        'No bots in this project match “{{value0}}”.',
                        { value0: query.trim() }
                      )
                    : translate(
                        'auto.components.sidebar.bots.group.CreateGroupChatDialog.37092229',
                        'No bots bound to this project yet.'
                      )}
              </div>
            )}
          </div>
        </ScrollArea>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <Input
            className="h-8 text-xs"
            maxLength={GROUP_CHAT_NAME_MAX_LENGTH}
            aria-label={translate(
              'auto.components.sidebar.bots.group.CreateGroupChatDialog.481a333a',
              'Room name'
            )}
            placeholder={placeholder}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </form>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {translate(
              'auto.components.sidebar.bots.group.CreateGroupChatDialog.592b444b',
              'Cancel'
            )}
          </Button>
          <Button
            disabled={selected.length < 2 || creating}
            title={
              selected.length < 2
                ? translate(
                    'auto.components.sidebar.bots.group.CreateGroupChatDialog.6a3c555c',
                    'Pick at least 2 bots'
                  )
                : undefined
            }
            onClick={() => void create()}
          >
            {selected.length > 0
              ? translate(
                  'auto.components.sidebar.bots.group.CreateGroupChatDialog.7b4d666d',
                  'Create room ({{value0}})',
                  { value0: selected.length }
                )
              : translate(
                  'auto.components.sidebar.bots.group.CreateGroupChatDialog.8c5e777e',
                  'Create room'
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CreateGroupChatDialog

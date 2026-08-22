import React, { useMemo, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import {
  BOT_AVATAR_CHOICES,
  BOT_DESCRIPTION_MAX_LENGTH,
  BOT_NAME_MAX_LENGTH,
  BOT_TITLE_MAX_LENGTH,
  DEFAULT_BOT_AVATAR,
  botHandle,
  type Bot,
  type BotCreateInput,
  type BotUpdateInput
} from '../../../../../shared/bot-types'
import type { TuiAgent } from '../../../../../shared/tui-agent'
import type { BotWorkspaceOption } from './bot-workspace-options'

const UNBOUND_VALUE = '__unbound__'

export type BotEditorDialogProps = {
  open: boolean
  /** The bot being edited, or null to create a new one. */
  bot: Bot | null
  workspaceOptions: readonly BotWorkspaceOption[]
  onOpenChange: (open: boolean) => void
  onCreate: (input: BotCreateInput) => Promise<unknown>
  onUpdate: (id: string, updates: BotUpdateInput) => Promise<unknown>
}

type EditorDraft = {
  name: string
  title: string
  description: string
  avatarEmoji: string
  agentId: TuiAgent
  workspaceKey: string | null
}

function draftFromBot(bot: Bot | null, fallbackAgent: TuiAgent): EditorDraft {
  return {
    name: bot?.name ?? '',
    title: bot?.title ?? '',
    description: bot?.description ?? '',
    avatarEmoji: bot?.avatarEmoji ?? DEFAULT_BOT_AVATAR,
    agentId: bot?.agentId ?? fallbackAgent,
    workspaceKey: bot?.workspaceKey ?? null
  }
}

export function BotEditorDialog({
  open,
  bot,
  workspaceOptions,
  onOpenChange,
  onCreate,
  onUpdate
}: BotEditorDialogProps): React.JSX.Element {
  const agents = useMemo(() => getAgentCatalog(), [])
  const fallbackAgent = (agents[0]?.id ?? 'claude') as TuiAgent
  const [draft, setDraft] = useState<EditorDraft>(() => draftFromBot(bot, fallbackAgent))
  const [saving, setSaving] = useState(false)

  // Reset when the dialog opens on a different subject; the dialog stays mounted between
  // opens, so without this an edit would inherit the previous bot's fields.
  const subjectKey = `${open ? 'open' : 'closed'}:${bot?.id ?? 'new'}`
  const lastSubjectRef = React.useRef(subjectKey)
  if (lastSubjectRef.current !== subjectKey) {
    lastSubjectRef.current = subjectKey
    if (open) {
      setDraft(draftFromBot(bot, fallbackAgent))
    }
  }

  const selectedWorkspace = workspaceOptions.find((option) => option.value === draft.workspaceKey)
  const canSave = draft.name.trim().length > 0 && !saving

  const handleSave = async (): Promise<void> => {
    if (!canSave) {
      return
    }
    setSaving(true)
    const payload = {
      name: draft.name,
      title: draft.title,
      description: draft.description,
      avatarEmoji: draft.avatarEmoji,
      agentId: draft.agentId,
      workspaceKey: draft.workspaceKey,
      projectId: selectedWorkspace?.projectId ?? null
    }
    const saved = bot ? await onUpdate(bot.id, payload) : await onCreate(payload)
    setSaving(false)
    if (saved) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {bot
              ? translate('auto.components.sidebar.bots.BotEditorDialog.4c1e90ab77', 'Edit bot')
              : translate('auto.components.sidebar.bots.BotEditorDialog.b21f7d3ce8', 'New bot')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.bots.BotEditorDialog.0a9d5f2b64',
              'A bot is a named agent with its own routines. It runs in the workspace you bind it to.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>
              {translate('auto.components.sidebar.bots.BotEditorDialog.7e35c1d0fa', 'Avatar')}
            </Label>
            <div className="flex flex-wrap gap-1">
              {BOT_AVATAR_CHOICES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={emoji}
                  aria-pressed={draft.avatarEmoji === emoji}
                  onClick={() => setDraft((current) => ({ ...current, avatarEmoji: emoji }))}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md border text-base transition-colors focus-visible:ring-1 focus-visible:ring-ring',
                    draft.avatarEmoji === emoji
                      ? 'border-ring bg-accent'
                      : 'border-transparent hover:bg-accent/50'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bot-name">
              {translate('auto.components.sidebar.bots.BotEditorDialog.5b8a41c7e9', 'Name')}
            </Label>
            <Input
              id="bot-name"
              value={draft.name}
              maxLength={BOT_NAME_MAX_LENGTH}
              placeholder={translate(
                'auto.components.sidebar.bots.BotEditorDialog.c0f7e2a1d3',
                'Release Checker'
              )}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              {translate(
                'auto.components.sidebar.bots.BotEditorDialog.aa3b6c9f10',
                'Mentioned as @{{value0}}',
                { value0: botHandle(draft.name || 'bot') }
              )}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bot-title">
              {translate('auto.components.sidebar.bots.BotEditorDialog.d4e81b02f5', 'Role')}
            </Label>
            <Input
              id="bot-title"
              value={draft.title}
              maxLength={BOT_TITLE_MAX_LENGTH}
              placeholder={translate(
                'auto.components.sidebar.bots.BotEditorDialog.1f6d3a8b47',
                'Checks the release branch every morning'
              )}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bot-description">
              {translate('auto.components.sidebar.bots.BotEditorDialog.83c0a7e5b1', 'Description')}
            </Label>
            <Textarea
              id="bot-description"
              value={draft.description}
              maxLength={BOT_DESCRIPTION_MAX_LENGTH}
              rows={3}
              placeholder={translate(
                'auto.components.sidebar.bots.BotEditorDialog.6b90fe14c2',
                'How this bot should work, in its own words.'
              )}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>
                {translate('auto.components.sidebar.bots.BotEditorDialog.2d7c4f8a90', 'Agent')}
              </Label>
              <Select
                value={draft.agentId}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, agentId: value as TuiAgent }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>
                {translate('auto.components.sidebar.bots.BotEditorDialog.9e02b6d3c4', 'Workspace')}
              </Label>
              <Select
                value={draft.workspaceKey ?? UNBOUND_VALUE}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    workspaceKey: value === UNBOUND_VALUE ? null : value
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNBOUND_VALUE}>
                    {translate(
                      'auto.components.sidebar.bots.BotEditorDialog.fb1c07e9a8',
                      'Not bound yet'
                    )}
                  </SelectItem>
                  {workspaceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedWorkspace && !selectedWorkspace.supportsRoutines ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              {translate(
                'auto.components.sidebar.bots.BotEditorDialog.31ac6e5470',
                'Folder workspaces cannot run scheduled routines. The bot saves, but its routine list stays empty until you bind it to a git workspace.'
              )}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {translate('auto.components.sidebar.bots.BotEditorDialog.7a0c1e94b6', 'Cancel')}
          </Button>
          <Button disabled={!canSave} onClick={() => void handleSave()}>
            {bot
              ? translate('auto.components.sidebar.bots.BotEditorDialog.c81f0d3a25', 'Save')
              : translate('auto.components.sidebar.bots.BotEditorDialog.4f9b2c60ad', 'Create bot')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default BotEditorDialog

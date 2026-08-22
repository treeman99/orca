import React, { useState } from 'react'
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
import type { AutomationCreateInput } from '../../../../../shared/automations-types'
import type { Bot } from '../../../../../shared/bot-types'
import {
  buildBotRoutineCreateInput,
  createBotRoutineDraft,
  isBotRoutineDraftComplete,
  type BotRoutineDraft,
  type BotRoutinePreset
} from './bot-routine-draft'

const PRESETS: readonly BotRoutinePreset[] = ['hourly', 'daily', 'weekdays', 'weekly']

export type BotRoutineDialogProps = {
  open: boolean
  bot: Bot
  onOpenChange: (open: boolean) => void
  onCreateRoutine: (input: AutomationCreateInput) => Promise<unknown>
}

export function BotRoutineDialog({
  open,
  bot,
  onOpenChange,
  onCreateRoutine
}: BotRoutineDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState<BotRoutineDraft>(createBotRoutineDraft)
  const [saving, setSaving] = useState(false)

  const openKey = `${open ? 'open' : 'closed'}:${bot.id}`
  const lastOpenKeyRef = React.useRef(openKey)
  if (lastOpenKeyRef.current !== openKey) {
    lastOpenKeyRef.current = openKey
    if (open) {
      setDraft(createBotRoutineDraft())
    }
  }

  const presetLabels: Record<BotRoutinePreset, string> = {
    hourly: translate('auto.components.sidebar.bots.BotRoutineDialog.1a5f0b73e2', 'Every hour'),
    daily: translate('auto.components.sidebar.bots.BotRoutineDialog.9c0e34a1f7', 'Every day'),
    weekdays: translate('auto.components.sidebar.bots.BotRoutineDialog.5d81b6f0c3', 'Weekdays'),
    weekly: translate('auto.components.sidebar.bots.BotRoutineDialog.b47e2a90d5', 'Every week')
  }

  const handleSave = async (): Promise<void> => {
    const input = buildBotRoutineCreateInput({
      bot,
      draft,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      now: Date.now()
    })
    if (!input) {
      return
    }
    setSaving(true)
    const created = await onCreateRoutine(input)
    setSaving(false)
    if (created) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.sidebar.bots.BotRoutineDialog.3e6c1d84b0', 'New routine')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.bots.BotRoutineDialog.a0f52e37c9',
              'A routine runs {{value0}} on a schedule in its bound workspace, and its output lands in the run history.',
              { value0: bot.name }
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="routine-name">
              {translate('auto.components.sidebar.bots.BotRoutineDialog.62b8f0a4d1', 'Name')}
            </Label>
            <Input
              id="routine-name"
              value={draft.name}
              placeholder={translate(
                'auto.components.sidebar.bots.BotRoutineDialog.c9d013fa76',
                'Morning check'
              )}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="routine-prompt">
              {translate('auto.components.sidebar.bots.BotRoutineDialog.7d41c0e8b2', 'Prompt')}
            </Label>
            <Textarea
              id="routine-prompt"
              rows={4}
              value={draft.prompt}
              placeholder={translate(
                'auto.components.sidebar.bots.BotRoutineDialog.4b17e93c05',
                'What should this bot do each time it runs?'
              )}
              onChange={(event) =>
                setDraft((current) => ({ ...current, prompt: event.target.value }))
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>
                {translate('auto.components.sidebar.bots.BotRoutineDialog.08fa6b21e4', 'Schedule')}
              </Label>
              <Select
                value={draft.preset}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, preset: value as BotRoutinePreset }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {presetLabels[preset]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="routine-time">
                {translate('auto.components.sidebar.bots.BotRoutineDialog.e520c7b3a8', 'Time')}
              </Label>
              <Input
                id="routine-time"
                type="time"
                value={draft.time}
                disabled={draft.preset === 'hourly'}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, time: event.target.value }))
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {translate('auto.components.sidebar.bots.BotRoutineDialog.dc0a17e6f3', 'Cancel')}
          </Button>
          <Button
            disabled={!isBotRoutineDraftComplete(draft) || saving}
            onClick={() => void handleSave()}
          >
            {translate(
              'auto.components.sidebar.bots.BotRoutineDialog.5f0b9e2c74',
              'Create routine'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default BotRoutineDialog

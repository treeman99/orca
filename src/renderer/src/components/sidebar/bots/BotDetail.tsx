import type React from 'react'
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getAgentLabel } from '@/lib/agent-catalog'
import type { Automation, AutomationRun } from '../../../../../shared/automations-types'
import { getBotRoutineEligibility, botHandle, type Bot } from '../../../../../shared/bot-types'
import BotRoutineList from './BotRoutineList'
import type { BotWorkspaceOption } from './bot-workspace-options'

export type BotDetailProps = {
  bot: Bot
  routines: readonly Automation[]
  runs: readonly AutomationRun[]
  workspaceOption: BotWorkspaceOption | null
  /** True when the enterprise policy refuses unattended runs; routines stay visible so a
   *  user can see what exists, but nothing offers to schedule more. */
  unattendedRunsDisabled: boolean
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onAddRoutine: () => void
  onToggleRoutine: (routineId: string, enabled: boolean) => void
  onRunRoutine: (routineId: string) => void
}

function SummaryRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate">{value}</span>
    </div>
  )
}

export function BotDetail({
  bot,
  routines,
  runs,
  workspaceOption,
  unattendedRunsDisabled,
  onBack,
  onEdit,
  onDelete,
  onAddRoutine,
  onToggleRoutine,
  onRunRoutine
}: BotDetailProps): React.JSX.Element {
  const eligibility = getBotRoutineEligibility(bot)
  const routineBlockedReason = eligibility.ok
    ? null
    : eligibility.reason === 'folder_workspace'
      ? translate(
          'auto.components.sidebar.bots.BotDetail.6c02a7e4f1',
          'Folder workspaces cannot run scheduled routines. Bind this bot to a git workspace to add one.'
        )
      : translate(
          'auto.components.sidebar.bots.BotDetail.9b41f0d2c6',
          'Bind this bot to a workspace before adding a routine.'
        )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mt-2 flex h-8 items-center gap-1 px-2">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onBack}
          aria-label={translate(
            'auto.components.sidebar.bots.BotDetail.f30b96c1a7',
            'Back to bots'
          )}
        >
          <ChevronLeft className="size-3.5" strokeWidth={2.25} />
        </Button>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground/80">
          {bot.name}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onEdit}
          aria-label={translate('auto.components.sidebar.bots.BotDetail.24e7b0af53', 'Edit bot')}
        >
          <Pencil className="size-3.5" strokeWidth={2.25} />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDelete}
          aria-label={translate('auto.components.sidebar.bots.BotDetail.b7c1e50d38', 'Delete bot')}
        >
          <Trash2 className="size-3.5" strokeWidth={2.25} />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 px-3 pb-4">
          <div className="flex items-start gap-2.5">
            <span className="text-2xl leading-none" aria-hidden="true">
              {bot.avatarEmoji}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{bot.name}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                @{botHandle(bot.name)}
              </span>
            </div>
          </div>

          {bot.title ? <p className="text-xs">{bot.title}</p> : null}
          {bot.description ? (
            <p className="text-[11px] whitespace-pre-wrap text-muted-foreground">
              {bot.description}
            </p>
          ) : null}

          <div className="flex flex-col gap-1">
            <SummaryRow
              label={translate('auto.components.sidebar.bots.BotDetail.0f5a3c8b91', 'Agent')}
              value={getAgentLabel(bot.agentId)}
            />
            <SummaryRow
              label={translate('auto.components.sidebar.bots.BotDetail.7e2d40b6ca', 'Workspace')}
              value={
                workspaceOption?.label ??
                translate('auto.components.sidebar.bots.BotDetail.c108d5f92b', 'Not bound yet')
              }
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
                {translate('auto.components.sidebar.bots.BotDetail.3a90c47e12', 'Routines')}
              </span>
              {eligibility.ok && !unattendedRunsDisabled ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onAddRoutine}
                  aria-label={translate(
                    'auto.components.sidebar.bots.BotDetail.d61b8e0f47',
                    'New routine'
                  )}
                >
                  <Plus className="size-3.5" strokeWidth={2.25} />
                </Button>
              ) : null}
            </div>

            {unattendedRunsDisabled ? (
              <p className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.sidebar.bots.BotDetail.85f2c603ea',
                  'Scheduled runs are turned off by your organization’s Orca policy. Existing routines stay listed but will not start.'
                )}
              </p>
            ) : routineBlockedReason ? (
              <p className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
                {routineBlockedReason}
              </p>
            ) : null}

            {routines.length > 0 ? (
              <BotRoutineList
                routines={routines}
                runs={runs}
                onToggleRoutine={onToggleRoutine}
                onRunRoutine={onRunRoutine}
              />
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {translate('auto.components.sidebar.bots.BotDetail.f04a1c7b58', 'No routines yet.')}
              </p>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

export default BotDetail

import type React from 'react'
import { Play } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { Automation, AutomationRun } from '../../../../../shared/automations-types'
import { formatAutomationSchedule } from '../../../../../shared/automation-schedules'
import { getAutomationRunStatusLabel } from '../../automations/automation-page-parts'

export type BotRoutineListProps = {
  routines: readonly Automation[]
  runs: readonly AutomationRun[]
  onToggleRoutine: (routineId: string, enabled: boolean) => void
  onRunRoutine: (routineId: string) => void
}

function findLatestRun(
  runs: readonly AutomationRun[],
  automationId: string
): AutomationRun | undefined {
  let latest: AutomationRun | undefined
  for (const run of runs) {
    if (run.automationId !== automationId) {
      continue
    }
    if (!latest || run.createdAt > latest.createdAt) {
      latest = run
    }
  }
  return latest
}

export function BotRoutineList({
  routines,
  runs,
  onToggleRoutine,
  onRunRoutine
}: BotRoutineListProps): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-1">
      {routines.map((routine) => {
        const latestRun = findLatestRun(runs, routine.id)
        return (
          <li
            key={routine.id}
            className="flex flex-col gap-1 rounded-md border border-border/60 px-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                {routine.name}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={translate(
                  'auto.components.sidebar.bots.BotRoutineList.0c73e1a5b9',
                  'Run now'
                )}
                onClick={() => onRunRoutine(routine.id)}
              >
                <Play className="size-3" strokeWidth={2.25} />
              </Button>
              <Switch
                checked={routine.enabled}
                aria-label={translate(
                  'auto.components.sidebar.bots.BotRoutineList.7f2b64c081',
                  'Routine enabled'
                )}
                onCheckedChange={(checked) => onToggleRoutine(routine.id, checked)}
              />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">{formatAutomationSchedule(routine.rrule)}</span>
              {latestRun ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{getAutomationRunStatusLabel(latestRun.status)}</span>
                </>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default BotRoutineList

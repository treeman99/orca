import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { useEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'
import type { AutomationCreateInput } from '../../../../../shared/automations-types'
import BotDetail from './BotDetail'
import BotEditorDialog from './BotEditorDialog'
import BotRoster from './BotRoster'
import BotRoutineDialog from './BotRoutineDialog'
import { buildBotWorkspaceOptions, findBotWorkspaceOption } from './bot-workspace-options'

function reportRoutineFailure(message: string, error: unknown): void {
  toast.error(message, error instanceof Error ? { description: error.message } : undefined)
}

export function BotsPanel(): React.JSX.Element {
  const bots = useAppStore((s) => s.bots)
  const botsLoaded = useAppStore((s) => s.botsLoaded)
  const selectedBotId = useAppStore((s) => s.selectedBotId)
  const botRoutines = useAppStore((s) => s.botRoutines)
  const botRoutineRuns = useAppStore((s) => s.botRoutineRuns)
  const fetchBots = useAppStore((s) => s.fetchBots)
  const fetchBotRoutines = useAppStore((s) => s.fetchBotRoutines)
  const createBot = useAppStore((s) => s.createBot)
  const updateBot = useAppStore((s) => s.updateBot)
  const deleteBot = useAppStore((s) => s.deleteBot)
  const setSelectedBotId = useAppStore((s) => s.setSelectedBotId)
  const repos = useAppStore((s) => s.repos)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const folderWorkspaces = useAppStore((s) => s.folderWorkspaces)

  const { disableUnattendedAgentRuns } = useEnterprisePolicyView()
  const confirm = useConfirmationDialog()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingBotId, setEditingBotId] = useState<string | null>(null)
  const [routineDialogOpen, setRoutineDialogOpen] = useState(false)

  useEffect(() => {
    if (!botsLoaded) {
      void fetchBots()
    }
    void fetchBotRoutines()
  }, [botsLoaded, fetchBots, fetchBotRoutines])

  const workspaceOptions = useMemo(
    () => buildBotWorkspaceOptions({ repos, worktreesByRepo, folderWorkspaces }),
    [repos, worktreesByRepo, folderWorkspaces]
  )

  const routineCountByBotId = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const routine of botRoutines) {
      if (routine.botId) {
        counts[routine.botId] = (counts[routine.botId] ?? 0) + 1
      }
    }
    return counts
  }, [botRoutines])

  const selectedBot = bots.find((bot) => bot.id === selectedBotId) ?? null
  const editingBot = bots.find((bot) => bot.id === editingBotId) ?? null

  const handleDelete = async (): Promise<void> => {
    if (!selectedBot) {
      return
    }
    const confirmed = await confirm({
      title: translate('auto.components.sidebar.bots.BotsPanel.a3f0d21c85', 'Delete this bot?'),
      description: translate(
        'auto.components.sidebar.bots.BotsPanel.5e7b019acd',
        'Its routines keep running and move to the Automations page, where you can reassign or remove them.'
      ),
      confirmLabel: translate('auto.components.sidebar.bots.BotsPanel.0b6c8f34e1', 'Delete'),
      confirmVariant: 'destructive'
    })
    if (confirmed) {
      await deleteBot(selectedBot.id)
    }
  }

  const handleCreateRoutine = async (input: AutomationCreateInput): Promise<unknown> => {
    try {
      const created = await window.api.automations.create(input)
      await fetchBotRoutines()
      return created
    } catch (error) {
      reportRoutineFailure(
        translate(
          'auto.components.sidebar.bots.BotsPanel.c47d0e6b13',
          'Could not create the routine.'
        ),
        error
      )
      return null
    }
  }

  // Both mutations report their own failure: the caller fires them with `void`, so an
  // unhandled rejection would leave the switch flipped in the UI with nothing said.
  const handleToggleRoutine = async (routineId: string, enabled: boolean): Promise<void> => {
    try {
      await window.api.automations.update({ id: routineId, updates: { enabled } })
    } catch (error) {
      reportRoutineFailure(
        translate(
          'auto.components.sidebar.bots.BotsPanel.9f04c1b673',
          'Could not change the routine.'
        ),
        error
      )
    }
    await fetchBotRoutines()
  }

  const handleRunRoutine = async (routineId: string): Promise<void> => {
    try {
      await window.api.automations.runNow({ id: routineId })
    } catch (error) {
      reportRoutineFailure(
        translate(
          'auto.components.sidebar.bots.BotsPanel.2e81a5d0f4',
          'Could not run the routine.'
        ),
        error
      )
    }
    await fetchBotRoutines()
  }

  return (
    <>
      {selectedBot ? (
        <BotDetail
          bot={selectedBot}
          routines={botRoutines.filter((routine) => routine.botId === selectedBot.id)}
          runs={botRoutineRuns}
          workspaceOption={findBotWorkspaceOption(workspaceOptions, selectedBot.workspaceKey)}
          unattendedRunsDisabled={disableUnattendedAgentRuns}
          onBack={() => setSelectedBotId(null)}
          onEdit={() => {
            setEditingBotId(selectedBot.id)
            setEditorOpen(true)
          }}
          onDelete={() => void handleDelete()}
          onAddRoutine={() => setRoutineDialogOpen(true)}
          onToggleRoutine={(routineId, enabled) => void handleToggleRoutine(routineId, enabled)}
          onRunRoutine={(routineId) => void handleRunRoutine(routineId)}
        />
      ) : (
        <BotRoster
          bots={bots}
          routineCountByBotId={routineCountByBotId}
          onSelectBot={setSelectedBotId}
          onCreateBot={() => {
            setEditingBotId(null)
            setEditorOpen(true)
          }}
        />
      )}

      <BotEditorDialog
        open={editorOpen}
        bot={editingBot}
        workspaceOptions={workspaceOptions}
        onOpenChange={setEditorOpen}
        onCreate={createBot}
        onUpdate={updateBot}
      />

      {selectedBot ? (
        <BotRoutineDialog
          open={routineDialogOpen}
          bot={selectedBot}
          onOpenChange={setRoutineDialogOpen}
          onCreateRoutine={handleCreateRoutine}
        />
      ) : null}
    </>
  )
}

export default BotsPanel

import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { useEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'
import type { AutomationCreateInput } from '../../../../../shared/automations-types'
import { getBotRoutineEligibility } from '../../../../../shared/bot-types'
import BotDetail from './BotDetail'
import BotEditorDialog from './BotEditorDialog'
import BotGroupRosterRows from './group/BotGroupRosterRows'
import CreateGroupChatDialog from './group/CreateGroupChatDialog'
import GroupRoomView from './group/GroupRoomView'
import { useBotGroupLane } from './group/use-bot-group-lane'
import BotRoster from './BotRoster'
import BotRoutineDialog from './BotRoutineDialog'
import { findLiveBotChatSession, getBotActivityState, getBotLatestReply } from './bot-chat-session'
import { openBotConversation } from './open-bot-conversation'
import { buildBotRosterActivity } from './bot-roster-activity'
import { buildBotRosterGroups } from './bot-roster-groups'
import { buildBotProjectOptions, findBotProjectOption } from './bot-project-options'

function reportRoutineFailure(message: string, error: unknown): void {
  toast.error(message, error instanceof Error ? { description: error.message } : undefined)
}

export function BotsPanel(): React.JSX.Element {
  const bots = useAppStore((s) => s.bots)
  const botsLoaded = useAppStore((s) => s.botsLoaded)
  const selectedBotId = useAppStore((s) => s.selectedBotId)
  const botRoutines = useAppStore((s) => s.botRoutines)
  const botRoutineRuns = useAppStore((s) => s.botRoutineRuns)
  const botChatLog = useAppStore((s) => s.botChatLog)
  const botSendInFlight = useAppStore((s) => s.botSendInFlight)
  const unreadBotIds = useAppStore((s) => s.unreadBotIds)
  // Selected reactively (not read through getState) so the activity dot and the "session is
  // gone" verdict follow the pane instead of freezing at selection time.
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const ptyIdsByTabId = useAppStore((s) => s.ptyIdsByTabId)
  const terminalLayoutsByTabId = useAppStore((s) => s.terminalLayoutsByTabId)
  const unifiedTabsByWorktree = useAppStore((s) => s.unifiedTabsByWorktree)
  const fetchBots = useAppStore((s) => s.fetchBots)
  const fetchBotRoutines = useAppStore((s) => s.fetchBotRoutines)
  const createBot = useAppStore((s) => s.createBot)
  const updateBot = useAppStore((s) => s.updateBot)
  const deleteBot = useAppStore((s) => s.deleteBot)
  const setSelectedBotId = useAppStore((s) => s.setSelectedBotId)
  const collapsedBotProjectIds = useAppStore((s) => s.collapsedBotProjectIds)
  const toggleBotProjectCollapsed = useAppStore((s) => s.toggleBotProjectCollapsed)
  const sendBotMessage = useAppStore((s) => s.sendBotMessage)
  const markBotChatRead = useAppStore((s) => s.markBotChatRead)
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)
  const setActiveTabForWorktree = useAppStore((s) => s.setActiveTabForWorktree)
  const setTabViewMode = useAppStore((s) => s.setTabViewMode)
  const repos = useAppStore((s) => s.repos)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)

  const groupLane = useBotGroupLane()
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

  useEffect(() => {
    if (selectedBotId) {
      markBotChatRead(selectedBotId)
    }
  }, [selectedBotId, markBotChatRead, botChatLog])

  const projectOptions = useMemo(
    () => buildBotProjectOptions({ repos, worktreesByRepo }),
    [repos, worktreesByRepo]
  )

  const rosterGroups = useMemo(
    () =>
      buildBotRosterGroups({
        bots,
        repos,
        unassignedLabel: translate(
          'auto.components.sidebar.bots.BotsPanel.30d7f1a6c8',
          'No workspace yet'
        )
      }),
    [bots, repos]
  )

  const rosterActivity = useMemo(
    () =>
      buildBotRosterActivity({
        bots,
        chatLog: botChatLog,
        state: {
          agentStatusByPaneKey,
          ptyIdsByTabId,
          terminalLayoutsByTabId,
          unifiedTabsByWorktree
        }
      }),
    [
      bots,
      botChatLog,
      agentStatusByPaneKey,
      ptyIdsByTabId,
      terminalLayoutsByTabId,
      unifiedTabsByWorktree
    ]
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

  // Recomputed from live pane state rather than stored: a pane the daemon could not keep
  // alive must read as "no session", not as a session that silently swallows messages.
  const selectedSession = useMemo(() => {
    if (!selectedBot) {
      return null
    }
    const eligibility = getBotRoutineEligibility(selectedBot)
    if (!eligibility.ok) {
      return null
    }
    return findLiveBotChatSession({
      chatPaneKey: selectedBot.chatPaneKey,
      botName: selectedBot.name,
      worktreeId: eligibility.worktreeId,
      agentId: selectedBot.agentId,
      state: {
        agentStatusByPaneKey,
        ptyIdsByTabId,
        terminalLayoutsByTabId,
        unifiedTabsByWorktree
      }
    })
  }, [
    selectedBot,
    agentStatusByPaneKey,
    ptyIdsByTabId,
    terminalLayoutsByTabId,
    unifiedTabsByWorktree
  ])

  // Heal a stale binding: an app restart re-creates tabs with new ids, so the stored pane key
  // can point at nothing while the session itself is right there under its bot: title.
  useEffect(() => {
    if (selectedBot && selectedSession && selectedBot.chatPaneKey !== selectedSession.paneKey) {
      void updateBot(selectedBot.id, { chatPaneKey: selectedSession.paneKey })
    }
  }, [selectedBot, selectedSession, updateBot])

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

  const handleSendMessage = async (text: string): Promise<void> => {
    if (!selectedBot) {
      return
    }
    const outcome = await sendBotMessage({ botId: selectedBot.id, text })
    if (!outcome) {
      return
    }
    if (outcome.status === 'unknown-handle') {
      toast.error(
        translate(
          'auto.components.sidebar.bots.BotsPanel.7b0e34a1c9',
          'No bot named @{{value0}}.',
          {
            value0: outcome.handle
          }
        )
      )
      return
    }
    if (outcome.status === 'failed') {
      toast.error(
        outcome.reason === 'folder_workspace'
          ? translate(
              'auto.components.sidebar.bots.BotsPanel.c62f019b4e',
              'That bot is bound to a folder workspace, which cannot run an agent.'
            )
          : outcome.reason === 'unbound'
            ? translate(
                'auto.components.sidebar.bots.BotsPanel.19d0b7e3ca',
                'That bot has no workspace yet.'
              )
            : translate(
                'auto.components.sidebar.bots.BotsPanel.4a8c17f0d3',
                'Could not reach that bot’s session.'
              )
      )
    }
  }

  // Double-click on a roster row, and the ↗ in the detail header, share this with the tab
  // bar's `+` menu, so all three land on the same pane in the same view.
  const openBotChat = async (botId: string): Promise<void> => {
    await openBotConversation(botId)
  }

  const openSelectedSession = useMemo(() => {
    if (!selectedBot || !selectedSession) {
      return null
    }
    const eligibility = getBotRoutineEligibility(selectedBot)
    if (!eligibility.ok) {
      return null
    }
    const { worktreeId } = eligibility
    const { tabId } = selectedSession
    return () => {
      setActiveWorktree(worktreeId)
      setActiveTabForWorktree(worktreeId, tabId)
      setTabViewMode(tabId, 'chat')
    }
  }, [selectedBot, selectedSession, setActiveWorktree, setActiveTabForWorktree, setTabViewMode])

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

  const groupProjectId = bots.find((bot) => bot.projectId)?.projectId ?? null

  return (
    <>
      {groupLane.selectedRoomId ? (
        <GroupRoomView roomId={groupLane.selectedRoomId} onBack={groupLane.closeRoom} />
      ) : selectedBot ? (
        <BotDetail
          bot={selectedBot}
          teammates={bots.filter((bot) => bot.id !== selectedBot.id)}
          routines={botRoutines.filter((routine) => routine.botId === selectedBot.id)}
          runs={botRoutineRuns}
          projectOption={findBotProjectOption(projectOptions, selectedBot.projectId)}
          chatEntries={botChatLog[selectedBot.id] ?? []}
          latestReply={getBotLatestReply(
            { agentStatusByPaneKey },
            selectedSession?.paneKey ?? null
          )}
          activity={getBotActivityState(selectedSession)}
          sending={botSendInFlight.includes(selectedBot.id)}
          unattendedRunsDisabled={disableUnattendedAgentRuns}
          onBack={() => setSelectedBotId(null)}
          onEdit={() => {
            setEditingBotId(selectedBot.id)
            setEditorOpen(true)
          }}
          onDelete={() => void handleDelete()}
          onSendMessage={handleSendMessage}
          onOpenSession={openSelectedSession}
          onAddRoutine={() => setRoutineDialogOpen(true)}
          onToggleRoutine={(routineId, enabled) => void handleToggleRoutine(routineId, enabled)}
          onRunRoutine={(routineId) => void handleRunRoutine(routineId)}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <BotGroupRosterRows
            rooms={groupLane.rooms}
            botsById={groupLane.botsById}
            runningRoomIds={groupLane.runningRoomIds}
            onOpenRoom={groupLane.openRoom}
            onCreateRoom={() => groupLane.setCreateOpen(true)}
            canCreate={Boolean(groupProjectId) && bots.length >= 2}
          />
          <BotRoster
            groups={rosterGroups}
            routineCountByBotId={routineCountByBotId}
            unreadBotIds={unreadBotIds}
            activityByBotId={rosterActivity}
            onOpenBotDetail={setSelectedBotId}
            onOpenBotChat={(botId) => void openBotChat(botId)}
            collapsedProjectIds={collapsedBotProjectIds}
            onToggleProject={toggleBotProjectCollapsed}
            onCreateBot={() => {
              setEditingBotId(null)
              setEditorOpen(true)
            }}
          />
        </div>
      )}

      <CreateGroupChatDialog
        open={groupLane.createOpen}
        projectId={groupProjectId}
        onOpenChange={groupLane.setCreateOpen}
        onCreated={groupLane.openRoom}
      />

      <BotEditorDialog
        open={editorOpen}
        bot={editingBot}
        projectOptions={projectOptions}
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

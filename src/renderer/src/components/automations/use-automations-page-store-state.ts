import { useCallback } from 'react'
import { filterEnabledTuiAgents } from '../../../../shared/tui-agent-selection'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { getAgentCatalog } from '@/lib/agent-catalog'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { resolveAutomationDefaultAgent } from './automation-default-agent'
import { useEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'
import { useAppStore } from '@/store'
import { useRepoMap, useWorktreeMap } from '@/store/selectors'
import {
  automationRepoForRow,
  automationWorktreeForRow,
  type AutomationListRow
} from './automation-list-row-identity'

// Why a call, not a module const: the corporate agent allowlist arrives over IPC after
// this module is imported, so a snapshot taken at import time is always unfiltered.
function getAutomationAgentIds(): TuiAgent[] {
  return getAgentCatalog().map((agent) => agent.id)
}

/** Store-backed values shared by the page's state and action hooks. */
export function useAutomationsPageStoreState() {
  const repos = useAppStore((s) => s.repos)
  const projectHostSetups = useAppStore((s) => s.projectHostSetups)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const unifiedTabsByWorktree = useAppStore((s) => s.unifiedTabsByWorktree)
  const terminalLayoutsByTabId = useAppStore((s) => s.terminalLayoutsByTabId)
  const ptyIdsByTabId = useAppStore((s) => s.ptyIdsByTabId)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const fetchWorktrees = useAppStore((s) => s.fetchWorktrees)
  const fetchRuntimeEnvironmentRepos = useAppStore((s) => s.fetchRuntimeEnvironmentRepos)
  const fetchAllWorktrees = useAppStore((s) => s.fetchAllWorktrees)
  const startupWorktreeRefreshCompleted = useAppStore((s) => s.startupWorktreeRefreshCompleted)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const closeAutomationsPage = useAppStore((s) => s.closeAutomationsPage)
  const activeModal = useAppStore((s) => s.activeModal)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const settings = useAppStore((s) => s.settings)
  const selectedId = useAppStore((s) => s.selectedAutomationId)
  const setSelectedId = useAppStore((s) => s.setSelectedAutomationId)
  const pendingAutomationRunNavigation = useAppStore((s) => s.pendingAutomationRunNavigation)
  const setPendingAutomationRunNavigation = useAppStore((s) => s.setPendingAutomationRunNavigation)
  const repoMap = useRepoMap()
  const worktreeMap = useWorktreeMap()
  const repoForRow = useCallback(
    (row: AutomationListRow): Repo | undefined => automationRepoForRow(row, repos, repoMap),
    [repoMap, repos]
  )
  const worktreeForRow = useCallback(
    (
      row: AutomationListRow,
      repo: Repo | undefined,
      workspaceId: string | null | undefined = row.automation.workspaceId
    ): Worktree | undefined =>
      automationWorktreeForRow(row, worktreesByRepo, repo, worktreeMap, workspaceId),
    [worktreeMap, worktreesByRepo]
  )
  const { allowedAgents } = useEnterprisePolicyView()
  const agentIds = getAutomationAgentIds()
  const enabledAgents = filterEnabledTuiAgents(agentIds, settings?.disabledTuiAgents)
  const defaultAgent = resolveAutomationDefaultAgent(
    settings,
    allowedAgents,
    agentIds,
    enabledAgents
  )

  return {
    repos,
    projectHostSetups,
    worktreesByRepo,
    unifiedTabsByWorktree,
    terminalLayoutsByTabId,
    ptyIdsByTabId,
    activeWorktreeId,
    fetchWorktrees,
    fetchRuntimeEnvironmentRepos,
    fetchAllWorktrees,
    startupWorktreeRefreshCompleted,
    updateSettings,
    openSettingsPage,
    openSettingsTarget,
    closeAutomationsPage,
    activeModal,
    sshConnectionStates,
    sshTargetLabels,
    runtimeEnvironments,
    runtimeStatusByEnvironmentId,
    settings,
    selectedId,
    setSelectedId,
    pendingAutomationRunNavigation,
    setPendingAutomationRunNavigation,
    repoMap,
    worktreeMap,
    repoForRow,
    worktreeForRow,
    defaultAgent
  }
}

export type AutomationsPageStoreState = ReturnType<typeof useAutomationsPageStoreState>

// @vitest-environment happy-dom

// Behavioural gate test for the new-workspace run-target picker under the corporate policy.
//
// Kept out of NewWorkspaceComposerCard.test.tsx because that file pins the UNGATED behaviour
// (the "Add Remote Orca Server" row present) and needs the real policy module to do it.
//
// Why this test exists at all: v1.4.162 moved the picker into
// components/new-workspace/RunTargetCombobox.tsx, where the row renders only when the parent
// hands down `onAddRemoteServer`. The gate is therefore a withheld prop in this file — invisible
// to anyone grepping the child for a policy import, and exactly the kind of thing an upstream
// merge drops with a green suite.

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NewWorkspaceComposerCard from './NewWorkspaceComposerCard'
import type { NewWorkspaceProjectOption } from '@/lib/new-workspace-project-options'
import type { ProjectHostSetupOption } from '@/lib/project-host-setup-options'
import type { EnterprisePolicyView } from '../../../shared/enterprise-policy-view'

const UNRESTRICTED: EnterprisePolicyView = {
  allowedAgents: null,
  lockdown: false,
  disableAutoUpdate: false,
  disableMobilePairing: false,
  disableMobileEmulator: false,
  disableExternalAutomations: false,
  disableAgentInstallSuggestions: false,
  disableUsagePolling: false,
  disableVendorProviderAccounts: false,
  disableRemoteOrcaServer: false,
  disableVoice: false,
  disablePlugins: false,
  requireComputerUseApproval: false
}

const policyState = vi.hoisted(() => ({ current: null as EnterprisePolicyView | null }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  getEnterprisePolicyView: () => policyState.current,
  getPolicyAllowedAgents: () => policyState.current?.allowedAgents ?? null,
  useEnterprisePolicyView: () => policyState.current
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        closeModal: vi.fn(),
        openModal: vi.fn(),
        openSettingsPage: vi.fn(),
        openSettingsTarget: vi.fn(),
        setRuntimeEnvironmentStatus: vi.fn(),
        activeModal: 'none',
        settings: { defaultTuiAgent: null, disabledTuiAgents: [] },
        updateSettings: vi.fn()
      }),
    { getState: () => ({ setRuntimeEnvironmentStatus: vi.fn() }) }
  )
}))

vi.mock('@/components/contextual-tours/use-contextual-tour', () => ({
  useContextualTour: vi.fn()
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@/components/agent/AgentCombobox', () => ({
  default: () => <button type="button">Agent picker</button>
}))

vi.mock('@/components/sidebar/AddRemoteHostDialog', () => ({
  AddRemoteHostDialog: () => null
}))

vi.mock('@/components/sparse/SparseCheckoutPresetSelect', () => ({
  default: () => <div data-testid="sparse-select" />
}))

vi.mock('@/components/new-workspace/SmartWorkspaceNameField', () => ({
  default: () => <input aria-label="workspace name" />
}))

vi.mock('@/components/new-workspace/ProjectCombobox', () => ({
  default: () => <div data-testid="project-combobox" />
}))

const projectOptions: NewWorkspaceProjectOption[] = [
  {
    kind: 'project-group',
    id: 'project-group:platform',
    projectGroupId: 'platform',
    displayName: 'Platform',
    badgeColor: 'var(--muted-foreground)',
    detail: '/workspace/platform',
    parentPath: '/workspace/platform',
    connectionId: null
  }
]

const localReadyHostOption: ProjectHostSetupOption = {
  kind: 'ready',
  id: 'setup-local',
  projectId: 'project-group:platform',
  hostId: 'local',
  repoId: 'repo-a',
  label: 'Local Mac',
  detail: 'Orca',
  path: '/Users/alice/orca'
}

function renderCard(): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <NewWorkspaceComposerCard
        quickAgent={null}
        onQuickAgentChange={() => {}}
        eligibleRepos={[]}
        repoId="repo-a"
        projectOptions={projectOptions}
        selectedProjectId="project-group:platform"
        selectedRepoIsGit
        onRepoChange={() => {}}
        onProjectChange={() => {}}
        primaryActionLabel="Create workspace"
        name=""
        onNameValueChange={() => {}}
        onSmartGitHubItemSelect={() => {}}
        onSmartGitLabItemSelect={() => {}}
        onSmartBranchSelect={() => {}}
        onSmartLinearIssueSelect={() => {}}
        smartNameSelection={null}
        onClearSmartNameSelection={() => {}}
        canReuseSelectedBranch={false}
        reuseSelectedBranch={false}
        onReuseSelectedBranchChange={() => {}}
        branchNameOverride=""
        onBranchNameOverrideChange={() => {}}
        forkPushWarning={null}
        detectedAgentIds={null}
        onOpenAgentSettings={() => {}}
        advancedOpen={false}
        onToggleAdvanced={() => {}}
        createDisabled={false}
        projectError={null}
        creating={false}
        onCreate={() => {}}
        note=""
        onNoteChange={() => {}}
        setupConfig={null}
        requiresExplicitSetupChoice={false}
        setupDecision={null}
        onSetupDecisionChange={() => {}}
        setupAgentStartupPolicy="start-immediately"
        onSetupAgentStartupPolicyChange={() => {}}
        shouldWaitForSetupCheck={false}
        resolvedSetupDecision={null}
        createError={null}
        selectedRepoConnectionId={null}
        selectedRepoSshStatus={null}
        selectedRepoRequiresConnection={false}
        selectedRepoConnectInProgress={false}
        onConnectSelectedRepo={async () => {}}
        canUseSparseCheckout={false}
        sparsePresets={[]}
        sparseSelectedPresetId={null}
        onSparseSelectPreset={() => {}}
        branchesEnabled={false}
        setupControlsEnabled={false}
        sparseControlsEnabled={false}
        projectHostSetupOptions={[localReadyHostOption]}
        selectedProjectHostSetupId="setup-local"
      />
    )
  })
  return { container, unmount: () => act(() => root.unmount()) }
}

function openRunTargetPicker(container: HTMLElement): void {
  const shell = container.querySelector<HTMLElement>('div[data-run-target-combobox-root="true"]')
  expect(shell).toBeTruthy()
  act(() => shell?.click())
}

function findRunTargetItem(label: string): HTMLElement | undefined {
  return [
    ...document.body.querySelectorAll<HTMLElement>('[role="option"], [data-run-target-add-host]')
  ].find((item) => item.textContent?.includes(label))
}

let current: { container: HTMLDivElement; unmount: () => void } | null = null

describe('new-workspace run target under the corporate policy', () => {
  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = {
      runtimeEnvironments: { getStatus: vi.fn().mockResolvedValue({ ok: false }) }
    }
    policyState.current = UNRESTRICTED
  })

  afterEach(() => {
    current?.unmount()
    current = null
    document.body.innerHTML = ''
  })

  it('offers Add Remote Orca Server when the policy allows it', () => {
    current = renderCard()
    openRunTargetPicker(current.container)
    act(() => findRunTargetItem('Add host')?.click())
    expect(findRunTargetItem('Add SSH host')).toBeTruthy()
    expect(findRunTargetItem('Add Remote Orca Server')).toBeTruthy()
  })

  it('hides Add Remote Orca Server under disableRemoteOrcaServer, keeping SSH hosts', () => {
    policyState.current = { ...UNRESTRICTED, disableRemoteOrcaServer: true }
    current = renderCard()
    openRunTargetPicker(current.container)
    act(() => findRunTargetItem('Add host')?.click())
    // SSH stays — the switch is about pairing another Orca, not about remote development.
    expect(findRunTargetItem('Add SSH host')).toBeTruthy()
    expect(findRunTargetItem('Add Remote Orca Server')).toBeUndefined()
  })
})

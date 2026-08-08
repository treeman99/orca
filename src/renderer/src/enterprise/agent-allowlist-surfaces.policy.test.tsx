// @vitest-environment happy-dom
//
// Behavioural gate for `allowedAgents` on the four screens that offer an agent to pick:
// Automations → `+`, Settings → Agents, the tab bar `+` menu, and the agent dashboard's
// spawn menu (added by v1.4.176 without a filter — see the block at the bottom).
//
// Why these live together, driven by the REAL policy module instead of a `vi.mock` of it:
// each screen already had its own filter and all three still leaked in a corporate build,
// because their one shared input is the policy this module caches. A test that mocks
// `enterprise-policy-access` proves the screen filters *something*; it cannot prove the
// value ever arrives. So the policy is delivered here the way main delivers it —
// `toEnterprisePolicyView` over a resolved policy, through `window.api`.
//
// The async channel is the one exercised on purpose: paired runtimes and the web host have
// only that one, so the lists are built once before the allowlist exists. A memo that keys
// on detection alone freezes the unfiltered list for the process lifetime.

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../../shared/enterprise-policy-fixture'
import {
  toEnterprisePolicyView,
  type EnterprisePolicyView
} from '../../../shared/enterprise-policy-view'
import { getDefaultSettings } from '../../../shared/constants'
import type { TuiAgent } from '../../../shared/types'

const ALLOWED = ['claude', 'opencode'] as const
// Ids the corporate policy does NOT list, one per catalog neighbourhood the pickers order by.
const BLOCKED: readonly TuiAgent[] = ['codex', 'gemini', 'grok', 'copilot', 'cursor']

const detection = vi.hoisted(() => ({ ids: [] as TuiAgent[] }))

vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: () => ({
    detectedIds: detection.ids,
    isLoading: false,
    detectionFailed: false,
    refresh: vi.fn()
  })
}))

vi.mock('@/hooks/useAgentDetectionTarget', () => ({
  useAgentDetectionTargetForWorktree: () => ({ kind: 'local' })
}))

import { getPolicyAllowedAgents, syncEnterprisePolicy } from './enterprise-policy-access'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'
import {
  AutomationEditorDialog,
  type AutomationDraft
} from '@/components/automations/AutomationEditorDialog'
import { AgentsPane } from '@/components/settings/AgentsPane'
import { QuickLaunchAgentMenuItems } from '@/components/tab-bar/QuickLaunchButton'
import { orderTabLaunchAgents } from '@/components/tab-bar/tab-agent-launch-options'
import { buildDashboardWorktreeLaunchOptions } from '@/components/dashboard/dashboard-worktree-launch-options'
import { launchDashboardAgent } from '@/components/dashboard/launch-dashboard-agent'
import { useAppStore } from '@/store'

const CORPORATE_VIEW: EnterprisePolicyView = toEnterprisePolicyView(
  makeLockdownPolicy({ allowedAgents: [...ALLOWED] })
)
const UNRESTRICTED_VIEW: EnterprisePolicyView = toEnterprisePolicyView(makeEnterprisePolicy())

/** Deliver a policy the way main does — after the first render, over the async channel. */
async function deliverPolicy(view: EnterprisePolicyView): Promise<void> {
  ;(window as unknown as { api?: unknown }).api = {
    enterprisePolicy: { get: async () => view }
  }
  await syncEnterprisePolicy()
}

const deliverCorporatePolicy = (): Promise<void> => deliverPolicy(CORPORATE_VIEW)

function makeDraft(overrides: Partial<AutomationDraft> = {}): AutomationDraft {
  return {
    name: '',
    prompt: '',
    agentId: 'claude',
    projectId: '',
    workspaceMode: 'new_per_run',
    workspaceId: '',
    baseBranch: '',
    reuseSession: false,
    precheckCommand: '',
    precheckTimeoutSeconds: '',
    preset: 'daily',
    time: '09:00',
    dayOfWeek: '1',
    customSchedule: '',
    missedRunGraceMinutes: '',
    scheduleWarning: null,
    ...overrides
  }
}

function renderAutomationEditor(draft = makeDraft()): void {
  render(
    <TooltipProvider>
      <AutomationEditorDialog
        open
        isEditing={false}
        isEditingExternal={false}
        isSaving={false}
        canSave={false}
        createTarget="orca"
        repos={[]}
        projectHostSetups={[]}
        automationYamlHooksByRepoKey={{}}
        getAutomationHooksCacheKey={(repoId) => repoId}
        repoMap={new Map()}
        worktrees={[]}
        settings={getDefaultSettings('/tmp')}
        draft={draft}
        onProjectChange={vi.fn()}
        onCreateTargetChange={vi.fn()}
        onOpenChange={vi.fn()}
        onDraftChange={vi.fn()}
        onSetupDecisionTouched={vi.fn()}
        onApplyTemplate={vi.fn()}
        onSave={vi.fn()}
      />
    </TooltipProvider>
  )
}

/** Open the dialog's Agent field and read back every agent it offers. */
async function offeredAgentNames(): Promise<string[]> {
  const trigger = document.querySelector<HTMLButtonElement>(
    'button[data-agent-combobox-root="true"]'
  )
  if (!trigger) {
    throw new Error('the automation editor rendered no agent picker')
  }
  await userEvent.click(trigger)
  return screen.queryAllByRole('option').map((option) => option.textContent ?? '')
}

function expectNoBlockedAgent(rendered: readonly string[]): void {
  const haystack = rendered.join('\n').toLowerCase()
  for (const blocked of BLOCKED) {
    expect({ blocked, present: haystack.includes(blocked) }).toEqual({ blocked, present: false })
  }
}

beforeEach(async () => {
  detection.ids = ['claude', 'opencode', ...BLOCKED]
  // The cached view is module state that outlives a case, so reset it the only way a
  // renderer can: by delivering an unrestricted one over the same channel.
  await deliverPolicy(UNRESTRICTED_VIEW)
})

afterEach(() => {
  cleanup()
})

describe('Automations → + → agent picker under allowedAgents', () => {
  it('offers the blocked agents when no corporate policy is deployed', async () => {
    expect(getPolicyAllowedAgents()).toBeNull()
    renderAutomationEditor()
    const names = await offeredAgentNames()
    expect(names.some((name) => name.toLowerCase().includes('codex'))).toBe(true)
  })

  it('drops the agents the policy does not list, even though the list was built first', async () => {
    renderAutomationEditor()
    await deliverCorporatePolicy()
    const names = await offeredAgentNames()
    expect(names.length).toBeGreaterThan(0)
    expectNoBlockedAgent(names)
  })

  // The draft's own agent stays selectable so editing a pre-existing automation still shows
  // it — that exception must read from the filtered catalog, not the full one, or a row
  // saved before the policy landed re-opens the blocked agent for selection.
  it('does not resurrect a blocked agent through the draft it is editing', async () => {
    renderAutomationEditor(makeDraft({ agentId: 'codex' }))
    await deliverCorporatePolicy()
    expectNoBlockedAgent(await offeredAgentNames())
  })
})

describe('Settings → Agents under allowedAgents', () => {
  it('lists only the allowed agents once the policy arrives', async () => {
    const view = render(
      <TooltipProvider>
        <AgentsPane settings={getDefaultSettings('/tmp')} updateSettings={vi.fn()} />
      </TooltipProvider>
    )
    expect(view.container.textContent).toContain('Codex')

    await deliverCorporatePolicy()
    view.rerender(
      <TooltipProvider>
        <AgentsPane settings={getDefaultSettings('/tmp')} updateSettings={vi.fn()} />
      </TooltipProvider>
    )
    expectNoBlockedAgent([view.container.textContent ?? ''])
    expect(view.container.textContent).toContain('Claude')
  })
})

describe('Tab bar → + → agent menu under allowedAgents', () => {
  it('drops the blocked agents from the quick-launch menu', async () => {
    const view = render(
      <TooltipProvider>
        <DropdownMenu open modal={false}>
          <DropdownMenuContent forceMount>
            <QuickLaunchAgentMenuItems worktreeId="w1" groupId="g1" onFocusTerminal={vi.fn()} />
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipProvider>
    )
    expect(document.body.textContent).toContain('Codex')

    await deliverCorporatePolicy()
    view.rerender(
      <TooltipProvider>
        <DropdownMenu open modal={false}>
          <DropdownMenuContent forceMount>
            <QuickLaunchAgentMenuItems worktreeId="w1" groupId="g1" onFocusTerminal={vi.fn()} />
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipProvider>
    )
    expectNoBlockedAgent([document.body.textContent ?? ''])
  })

  // The same `+` surface also answers typed queries from this list (TabBar builds it once
  // per detection change), so the ordering helper is gated on the live policy too.
  it('drops the blocked agents from the typed-query list', async () => {
    await deliverCorporatePolicy()
    expect(orderTabLaunchAgents(null, detection.ids, getPolicyAllowedAgents())).toEqual([
      'claude',
      'opencode'
    ])
  })
})

// The agent dashboard's spawn menu arrived in v1.4.176 as a fourth picker, sourced from raw
// CLI detection rather than the catalog the other three read. `ipc/pty.ts` still refuses the
// spawn, so an unfiltered menu is not a bypass — it offers an agent that errors on click.
describe('agent dashboard → spawn menu under allowedAgents', () => {
  const DASHBOARD_STATE = {
    repos: [{ id: 'r1', executionHostId: undefined }],
    settings: getDefaultSettings('/tmp'),
    worktreesByRepo: { r1: [{ id: 'w1', repoId: 'r1' }] },
    detectedAgentIds: [...ALLOWED, ...BLOCKED]
  } as unknown as Parameters<typeof buildDashboardWorktreeLaunchOptions>[0]
  const CARDS = [] as Parameters<typeof buildDashboardWorktreeLaunchOptions>[1]
  const WORKSPACES = [
    { worktreeId: 'w1', repoId: 'r1' }
  ] as unknown as Parameters<typeof buildDashboardWorktreeLaunchOptions>[2]

  it('offers every detected agent when no corporate policy is deployed', async () => {
    await deliverPolicy(UNRESTRICTED_VIEW)
    const offered = buildDashboardWorktreeLaunchOptions(DASHBOARD_STATE, CARDS, WORKSPACES).w1 ?? []
    for (const blocked of BLOCKED) {
      expect({ blocked, offered: offered.includes(blocked) }).toEqual({ blocked, offered: true })
    }
  })

  it('drops the agents the policy does not list', async () => {
    await deliverCorporatePolicy()
    const offered = buildDashboardWorktreeLaunchOptions(DASHBOARD_STATE, CARDS, WORKSPACES).w1 ?? []
    expectNoBlockedAgent(offered)
  })

  // Why the launcher too: the popout renderer posts an agent id of its own over IPC, so a
  // stale snapshot must not stay spawnable after the policy lands. The worktree is seeded
  // into the real store first, or the launcher would short-circuit before reaching the gate
  // and the assertion would pass for the wrong reason.
  it('refuses to launch a blocked agent even when asked directly', async () => {
    useAppStore.setState({
      repos: DASHBOARD_STATE.repos,
      worktreesByRepo: DASHBOARD_STATE.worktreesByRepo
    } as Partial<ReturnType<typeof useAppStore.getState>>)
    expect(useAppStore.getState().getKnownWorktreeById('w1')).toBeDefined()

    await deliverCorporatePolicy()
    expect(launchDashboardAgent({ worktreeId: 'w1', agent: 'codex' })).toBe(false)
  })
})

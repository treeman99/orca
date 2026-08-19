// The corporate policy has to beat every writer of `activeView`, not just the action.
//
// Why a behavioural test and not a resolver test: the reported symptom was "the same
// installer shows Orca Mobile on one PC and not another". One real cause was persisted
// UI state — a machine last left on the Mobile page restored it at startup, past the
// only gate. A resolver test proves the policy object is right, not that hydration
// consults it.

import { createStore, type StoreApi } from 'zustand/vanilla'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultUIState } from '../../../../shared/constants'
import type { PersistedUIState } from '../../../../shared/persisted-ui-state-types'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'
import type { AppState } from '../types'

const policyState = vi.hoisted(() => ({
  disableMobilePairing: false
}))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  getEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView,
  useEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView
}))

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }))

const { createUISlice } = await import('./ui')
const { createWorktreeNavHistorySlice } = await import('./worktree-nav-history')
const { createSettingsSearchState } = await import('./settings-search-state')

function createUIStore(): StoreApi<AppState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createStore<any>()((...args: any[]) => ({
    repos: [],
    worktreesByRepo: {},
    rightSidebarOpen: false,
    rightSidebarWidth: 280,
    markdownTocPanelWidth: 240,
    combinedDiffFileTreeWidth: 256,
    rightSidebarTab: 'explorer',
    rightSidebarExplorerView: 'files',
    ...createSettingsSearchState(args[0]),
    ...createWorktreeNavHistorySlice(...(args as Parameters<typeof createWorktreeNavHistorySlice>)),
    ...createUISlice(...(args as Parameters<typeof createUISlice>))
  })) as unknown as StoreApi<AppState>
}

function makePersistedUI(overrides: Partial<PersistedUIState> = {}): PersistedUIState {
  return { ...getDefaultUIState(), ...overrides }
}

describe('mobile view under the corporate policy', () => {
  beforeEach(() => {
    policyState.disableMobilePairing = false
  })

  // The PC-to-PC difference: `showMobileButton` defaults to on, so the user setting is
  // not what kept the page alive — the persisted view was.
  it('drops a persisted mobile view at startup, whatever the user setting says', () => {
    policyState.disableMobilePairing = true
    const store = createUIStore()
    store.setState({
      settings: { showMobileButton: true } as AppState['settings']
    })

    store.getState().hydratePersistedUI(makePersistedUI({ activeView: 'mobile' }), 'startup')

    expect(store.getState().activeView).toBe('terminal')
  })

  it('still restores the persisted mobile view when no policy is in force', () => {
    const store = createUIStore()
    store.setState({
      settings: { showMobileButton: false } as AppState['settings']
    })

    store.getState().hydratePersistedUI(makePersistedUI({ activeView: 'mobile' }), 'startup')

    expect(store.getState().activeView).toBe('mobile')
  })

  it('refuses openMobilePage under the policy and keeps the current view', () => {
    policyState.disableMobilePairing = true
    const store = createUIStore()

    store.getState().openMobilePage()

    expect(store.getState().activeView).toBe('terminal')
  })

  it('refuses the generic setActiveView under the policy', () => {
    policyState.disableMobilePairing = true
    const store = createUIStore()

    store.getState().setActiveView('mobile')

    expect(store.getState().activeView).toBe('terminal')
  })

  it('leaves every other view alone under the policy', () => {
    policyState.disableMobilePairing = true
    const store = createUIStore()

    store.getState().setActiveView('settings')
    expect(store.getState().activeView).toBe('settings')

    store.getState().hydratePersistedUI(makePersistedUI({ activeView: 'tasks' }), 'startup')
    expect(store.getState().activeView).toBe('tasks')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type * as AgentStatusModule from '@/lib/agent-status'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  createTestStore,
  makeTabGroup,
  makeUnifiedTab,
  makeWorktree,
  seedStore
} from './store-test-helpers'
import { createStoreCascadesMockApi } from './store-cascades-test-harness'
import {
  _resetOrchestrationWorkerPaneColumnForTests,
  claimOrchestrationWorkerPaneGroup,
  recordOrchestrationWorkerTab
} from './orchestration-worker-pane-column'

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}))

vi.mock('@/components/terminal-pane/pty-dispatcher', () => ({
  restorePtyDataHandlersAfterFailedShutdown: vi.fn(),
  unregisterPtyDataHandlers: vi.fn(() => [])
}))

vi.mock('@/lib/agent-status', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentStatusModule>()
  return { ...actual, detectAgentStatusFromTitle: vi.fn().mockReturnValue(null) }
})

createStoreCascadesMockApi()

const WORKTREE_ID = 'repo1::/path/wt1'
const COORDINATOR_TAB_ID = 'tab-coordinator'
const PLACEMENT = { kind: 'orchestration-worker' as const, coordinatorTabId: COORDINATOR_TAB_ID }

function seedCoordinator(
  store: ReturnType<typeof createTestStore>,
  settings: Partial<GlobalSettings> = {}
): void {
  seedStore(store, {
    worktreesByRepo: {
      repo1: [makeWorktree({ id: WORKTREE_ID, repoId: 'repo1', path: '/path/wt1' })]
    },
    settings: {
      ...getDefaultSettings('/home/test'),
      autoSplitOrchestrationWorkerPanes: true,
      ...settings
    } as GlobalSettings,
    groupsByWorktree: {
      [WORKTREE_ID]: [
        makeTabGroup({
          id: 'g-coord',
          worktreeId: WORKTREE_ID,
          activeTabId: COORDINATOR_TAB_ID,
          tabOrder: [COORDINATOR_TAB_ID]
        })
      ]
    },
    activeGroupIdByWorktree: { [WORKTREE_ID]: 'g-coord' },
    layoutByWorktree: { [WORKTREE_ID]: { type: 'leaf', groupId: 'g-coord' } },
    unifiedTabsByWorktree: {
      [WORKTREE_ID]: [
        makeUnifiedTab({
          id: COORDINATOR_TAB_ID,
          worktreeId: WORKTREE_ID,
          groupId: 'g-coord',
          contentType: 'terminal'
        })
      ]
    }
  })
}

/** Mimic useIpcEvents: claim a group, create the worker tab there, then track it. */
function dispatchWorker(store: ReturnType<typeof createTestStore>, workerTabId: string): string {
  const groupId = claimOrchestrationWorkerPaneGroup(store, {
    worktreeId: WORKTREE_ID,
    paneGroupPlacement: PLACEMENT
  })
  expect(groupId).toBeTruthy()
  store.setState((state) => ({
    unifiedTabsByWorktree: {
      ...state.unifiedTabsByWorktree,
      [WORKTREE_ID]: [
        ...(state.unifiedTabsByWorktree[WORKTREE_ID] ?? []),
        makeUnifiedTab({
          id: workerTabId,
          worktreeId: WORKTREE_ID,
          groupId: groupId as string,
          contentType: 'terminal'
        })
      ]
    },
    groupsByWorktree: {
      ...state.groupsByWorktree,
      [WORKTREE_ID]: (state.groupsByWorktree[WORKTREE_ID] ?? []).map((group) =>
        group.id === groupId
          ? { ...group, activeTabId: workerTabId, tabOrder: [...group.tabOrder, workerTabId] }
          : group
      )
    }
  }))
  recordOrchestrationWorkerTab(COORDINATOR_TAB_ID, workerTabId)
  return groupId as string
}

describe('claimOrchestrationWorkerPaneGroup', () => {
  beforeEach(() => {
    _resetOrchestrationWorkerPaneColumnForTests()
  })

  it('returns nothing while the preference is off', () => {
    const store = createTestStore()
    seedCoordinator(store, { autoSplitOrchestrationWorkerPanes: false })

    expect(
      claimOrchestrationWorkerPaneGroup(store, {
        worktreeId: WORKTREE_ID,
        paneGroupPlacement: PLACEMENT
      })
    ).toBeUndefined()
    expect(store.getState().layoutByWorktree[WORKTREE_ID]).toEqual({
      type: 'leaf',
      groupId: 'g-coord'
    })
  })

  it('returns nothing when the coordinator lives in another worktree', () => {
    const store = createTestStore()
    seedCoordinator(store)

    expect(
      claimOrchestrationWorkerPaneGroup(store, {
        worktreeId: WORKTREE_ID,
        paneGroupPlacement: { kind: 'orchestration-worker', coordinatorTabId: 'tab-elsewhere' }
      })
    ).toBeUndefined()
  })

  it('opens the first worker in a column split off the coordinator without moving focus', () => {
    const store = createTestStore()
    seedCoordinator(store)

    const groupId = dispatchWorker(store, 'tab-worker-1')

    expect(store.getState().layoutByWorktree[WORKTREE_ID]).toEqual({
      type: 'split',
      direction: 'horizontal',
      first: { type: 'leaf', groupId: 'g-coord' },
      second: { type: 'leaf', groupId },
      ratio: 0.5
    })
    expect(store.getState().activeGroupIdByWorktree[WORKTREE_ID]).toBe('g-coord')
  })

  it('stacks the second and third workers down the column with even ratios', () => {
    const store = createTestStore()
    seedCoordinator(store)

    const first = dispatchWorker(store, 'tab-worker-1')
    const second = dispatchWorker(store, 'tab-worker-2')
    const third = dispatchWorker(store, 'tab-worker-3')

    expect(store.getState().layoutByWorktree[WORKTREE_ID]).toEqual({
      type: 'split',
      direction: 'horizontal',
      first: { type: 'leaf', groupId: 'g-coord' },
      second: {
        type: 'split',
        direction: 'vertical',
        first: { type: 'leaf', groupId: first },
        second: {
          type: 'split',
          direction: 'vertical',
          first: { type: 'leaf', groupId: second },
          second: { type: 'leaf', groupId: third },
          ratio: 0.5
        },
        ratio: 1 / 3
      },
      ratio: 0.5
    })
  })

  it('stops splitting at three worker panes and reuses the last group', () => {
    const store = createTestStore()
    seedCoordinator(store)

    dispatchWorker(store, 'tab-worker-1')
    dispatchWorker(store, 'tab-worker-2')
    const third = dispatchWorker(store, 'tab-worker-3')
    const layoutAfterThird = store.getState().layoutByWorktree[WORKTREE_ID]

    expect(
      claimOrchestrationWorkerPaneGroup(store, {
        worktreeId: WORKTREE_ID,
        paneGroupPlacement: PLACEMENT
      })
    ).toBe(third)
    expect(store.getState().layoutByWorktree[WORKTREE_ID]).toEqual(layoutAfterThird)
  })

  it('starts a fresh column once the tracked worker tabs are gone', () => {
    const store = createTestStore()
    seedCoordinator(store)

    const first = dispatchWorker(store, 'tab-worker-1')
    store.setState((state) => ({
      unifiedTabsByWorktree: {
        ...state.unifiedTabsByWorktree,
        [WORKTREE_ID]: (state.unifiedTabsByWorktree[WORKTREE_ID] ?? []).filter(
          (tab) => tab.id !== 'tab-worker-1'
        )
      },
      groupsByWorktree: {
        ...state.groupsByWorktree,
        [WORKTREE_ID]: (state.groupsByWorktree[WORKTREE_ID] ?? []).filter(
          (group) => group.id !== first
        )
      },
      layoutByWorktree: {
        ...state.layoutByWorktree,
        [WORKTREE_ID]: { type: 'leaf', groupId: 'g-coord' }
      }
    }))

    const next = claimOrchestrationWorkerPaneGroup(store, {
      worktreeId: WORKTREE_ID,
      paneGroupPlacement: PLACEMENT
    })

    expect(next).not.toBe(first)
    expect(store.getState().layoutByWorktree[WORKTREE_ID]).toEqual({
      type: 'split',
      direction: 'horizontal',
      first: { type: 'leaf', groupId: 'g-coord' },
      second: { type: 'leaf', groupId: next },
      ratio: 0.5
    })
  })
})

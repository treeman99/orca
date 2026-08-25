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

  it('stacks workers two through four down the column with even ratios', () => {
    const store = createTestStore()
    seedCoordinator(store)

    const first = dispatchWorker(store, 'tab-worker-1')
    const second = dispatchWorker(store, 'tab-worker-2')
    const third = dispatchWorker(store, 'tab-worker-3')
    const fourth = dispatchWorker(store, 'tab-worker-4')

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
          second: {
            type: 'split',
            direction: 'vertical',
            first: { type: 'leaf', groupId: third },
            second: { type: 'leaf', groupId: fourth },
            ratio: 0.5
          },
          ratio: 1 / 3
        },
        ratio: 0.25
      },
      ratio: 0.5
    })
  })

  it('stops splitting at four panes and fills them from the top down', () => {
    const store = createTestStore()
    seedCoordinator(store)

    const column = [1, 2, 3, 4].map((n) => dispatchWorker(store, `tab-worker-${n}`))
    const layoutAfterFourth = store.getState().layoutByWorktree[WORKTREE_ID]

    // The fifth worker joins the *top* pane, not the bottom one it used to bury.
    expect([5, 6, 7, 8, 9].map((n) => dispatchWorker(store, `tab-worker-${n}`))).toEqual([
      ...column,
      column[0]
    ])
    expect(store.getState().layoutByWorktree[WORKTREE_ID]).toEqual(layoutAfterFourth)
  })

  it('refills the pane a worker was closed in before moving on', () => {
    const store = createTestStore()
    seedCoordinator(store)

    const column = [1, 2, 3, 4].map((n) => dispatchWorker(store, `tab-worker-${n}`))
    for (const n of [5, 6, 7, 8]) {
      dispatchWorker(store, `tab-worker-${n}`)
    }
    // Close the second pane's original worker; that pane is now the lightest.
    store.setState((state) => ({
      unifiedTabsByWorktree: {
        ...state.unifiedTabsByWorktree,
        [WORKTREE_ID]: (state.unifiedTabsByWorktree[WORKTREE_ID] ?? []).filter(
          (tab) => tab.id !== 'tab-worker-2'
        )
      }
    }))

    expect(dispatchWorker(store, 'tab-worker-10')).toBe(column[1])
  })

  it('stops at the pane count the user chose instead of the default four', () => {
    const store = createTestStore()
    seedCoordinator(store, { orchestrationMaxWorkerPanes: 2 })

    const first = dispatchWorker(store, 'tab-worker-1')
    const second = dispatchWorker(store, 'tab-worker-2')

    expect(store.getState().layoutByWorktree[WORKTREE_ID]).toEqual({
      type: 'split',
      direction: 'horizontal',
      first: { type: 'leaf', groupId: 'g-coord' },
      second: {
        type: 'split',
        direction: 'vertical',
        first: { type: 'leaf', groupId: first },
        second: { type: 'leaf', groupId: second },
        ratio: 0.5
      },
      ratio: 0.5
    })
    // The column is already full at two, so the cycle starts back at the top.
    expect([3, 4, 5].map((n) => dispatchWorker(store, `tab-worker-${n}`))).toEqual([
      first,
      second,
      first
    ])
  })

  it('clamps a hand-edited pane count rather than stranding the column', () => {
    const store = createTestStore()
    seedCoordinator(store, { orchestrationMaxWorkerPanes: 0 })

    const only = dispatchWorker(store, 'tab-worker-1')

    expect(dispatchWorker(store, 'tab-worker-2')).toBe(only)
    expect(store.getState().layoutByWorktree[WORKTREE_ID]).toEqual({
      type: 'split',
      direction: 'horizontal',
      first: { type: 'leaf', groupId: 'g-coord' },
      second: { type: 'leaf', groupId: only },
      ratio: 0.5
    })
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

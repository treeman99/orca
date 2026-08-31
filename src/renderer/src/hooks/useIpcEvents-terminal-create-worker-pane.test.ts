import { describe, expect, it } from 'vitest'
import { setupTerminalCreateSurfacing } from './ipc-events-terminal-create-test-harness'
import { _resetOrchestrationWorkerPaneColumnForTests } from '@/store/slices/orchestration-worker-pane-column'

const COORDINATOR_TAB_ID = 'tab-coordinator'
const WORKER_LEAF_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

/** The payload `orchestration worker-start` produces for a same-worktree worker. */
function workerCreate(overrides: Record<string, unknown> = {}) {
  return {
    worktreeId: 'wt-1',
    ptyId: 'pty-worker-1',
    tabId: 'tab-worker-1',
    leafId: WORKER_LEAF_ID,
    surfaceOwner: false as const,
    paneGroupPlacement: {
      kind: 'orchestration-worker' as const,
      coordinatorTabId: COORDINATOR_TAB_ID
    },
    ...overrides
  }
}

describe('useIpcEvents orchestration worker pane placement', () => {
  it('opens a worker beside its coordinator only while the preference is on', async () => {
    _resetOrchestrationWorkerPaneColumnForTests()
    const scenario = await setupTerminalCreateSurfacing(() => false)
    const { createTab, createEmptySplitGroup, storeState, createTerminalListenerRef } = scenario
    if (!createTerminalListenerRef.current) {
      throw new Error('Expected create-terminal listener to be registered')
    }
    storeState.groupsByWorktree['wt-1'] = [{ id: 'g-coord', tabOrder: [COORDINATOR_TAB_ID] }]
    storeState.unifiedTabsByWorktree['wt-1'] = [
      {
        id: COORDINATOR_TAB_ID,
        entityId: COORDINATOR_TAB_ID,
        groupId: 'g-coord',
        contentType: 'terminal'
      }
    ]

    // Default (off): the worker keeps landing in the worktree's active group.
    createTerminalListenerRef.current(workerCreate())
    expect(createEmptySplitGroup).not.toHaveBeenCalled()
    expect(createTab).toHaveBeenCalledWith('wt-1', undefined, undefined, expect.anything())

    createTab.mockClear()
    storeState.settings.autoSplitOrchestrationWorkerPanes = true
    createTerminalListenerRef.current(
      workerCreate({ tabId: 'tab-worker-2', ptyId: 'pty-worker-2' })
    )

    expect(createEmptySplitGroup).toHaveBeenCalledWith('wt-1', 'g-coord', 'right', {
      activate: false,
      recordInteraction: false
    })
    expect(createTab).toHaveBeenCalledWith(
      'wt-1',
      'g-split-1',
      undefined,
      expect.objectContaining({ initialPtyId: 'pty-worker-2', id: 'tab-worker-2' })
    )
  })

  it('keeps the claimed worker group when the payload carries no ptyId', async () => {
    _resetOrchestrationWorkerPaneColumnForTests()
    const scenario = await setupTerminalCreateSurfacing(() => false)
    const { createTab, createEmptySplitGroup, storeState, createTerminalListenerRef } = scenario
    if (!createTerminalListenerRef.current) {
      throw new Error('Expected create-terminal listener to be registered')
    }
    storeState.groupsByWorktree['wt-1'] = [{ id: 'g-coord', tabOrder: [COORDINATOR_TAB_ID] }]
    storeState.unifiedTabsByWorktree['wt-1'] = [
      {
        id: COORDINATOR_TAB_ID,
        entityId: COORDINATOR_TAB_ID,
        groupId: 'g-coord',
        contentType: 'terminal'
      }
    ]
    storeState.settings.autoSplitOrchestrationWorkerPanes = true

    createTerminalListenerRef.current(workerCreate({ ptyId: undefined }))

    // Claiming the group already split the layout; dropping the id on this branch
    // would strand an empty worker pane while the tab opened somewhere else.
    expect(createEmptySplitGroup).toHaveBeenCalledWith('wt-1', 'g-coord', 'right', {
      activate: false,
      recordInteraction: false
    })
    expect(createTab).toHaveBeenCalledWith('wt-1', 'g-split-1', undefined, expect.anything())
  })

  it('leaves the layout alone for terminals dispatched without a placement', async () => {
    _resetOrchestrationWorkerPaneColumnForTests()
    const scenario = await setupTerminalCreateSurfacing(() => false)
    const { createTab, createEmptySplitGroup, storeState, createTerminalListenerRef } = scenario
    if (!createTerminalListenerRef.current) {
      throw new Error('Expected create-terminal listener to be registered')
    }
    storeState.settings.autoSplitOrchestrationWorkerPanes = true
    storeState.groupsByWorktree['wt-1'] = [{ id: 'g-coord', tabOrder: [COORDINATOR_TAB_ID] }]

    createTerminalListenerRef.current({
      worktreeId: 'wt-1',
      ptyId: 'pty-plain',
      tabId: 'tab-plain',
      leafId: WORKER_LEAF_ID
    })

    expect(createEmptySplitGroup).not.toHaveBeenCalled()
    expect(createTab).toHaveBeenCalledWith('wt-1', undefined, undefined, expect.anything())
  })
})

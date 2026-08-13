import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultWorkspaceSession } from '../../shared/constants'
import type { WorkspaceSessionState } from '../../shared/types'

const { handleMock, onMock } = vi.hoisted(() => ({ handleMock: vi.fn(), onMock: vi.fn() }))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock, on: onMock }
}))

import { registerSessionHandlers } from './session'

const WORKTREE_ID = 'repo::/worktree'
const REPO_ID = 'repo'

function terminalTab(id: string, sortOrder: number) {
  return {
    id,
    ptyId: `pty-${id}`,
    worktreeId: WORKTREE_ID,
    title: 'Terminal',
    customTitle: null,
    color: null,
    sortOrder,
    createdAt: 1
  }
}

function seededSession(): WorkspaceSessionState {
  return {
    ...getDefaultWorkspaceSession(),
    tabsByWorktree: { [WORKTREE_ID]: [terminalTab('tab-a', 0), terminalTab('tab-b', 1)] },
    terminalLayoutsByTabId: {
      'tab-a': {
        root: { type: 'leaf', leafId: 'left' },
        activeLeafId: 'left',
        expandedLeafId: null,
        ptyIdsByLeafId: { left: 'pty-tab-a' }
      }
    },
    terminalTopologyRevisionByRepoId: { [REPO_ID]: 3 }
  }
}

function createStore(initial: WorkspaceSessionState) {
  const sessionsByHost = new Map<string, WorkspaceSessionState>([['local', initial]])
  return {
    flushOrThrow: vi.fn(),
    flush: vi.fn(),
    getWorkspaceSession: vi.fn((hostId?: string | null) => sessionsByHost.get(hostId ?? 'local')!),
    setWorkspaceSession: vi.fn((next: WorkspaceSessionState, hostId?: string | null) => {
      sessionsByHost.set(hostId ?? 'local', next)
    }),
    sessionsByHost
  }
}

function invokeRetire(args: unknown, hostId?: string): unknown {
  const entry = handleMock.mock.calls.find((call) => call[0] === 'session:retireClosedTerminalTabs')
  if (!entry) {
    throw new Error('session:retireClosedTerminalTabs handler was not registered')
  }
  return (entry[1] as (event: unknown, args: unknown, hostId?: string) => unknown)({}, args, hostId)
}

describe('session:retireClosedTerminalTabs', () => {
  beforeEach(() => {
    handleMock.mockReset()
    onMock.mockReset()
  })

  it('removes the tab from the durable session and flushes it', () => {
    const store = createStore(seededSession())
    registerSessionHandlers(store as never)

    invokeRetire({ closures: [{ worktreeId: WORKTREE_ID, tabId: 'tab-a' }] })

    const next = store.sessionsByHost.get('local')!
    expect(next.tabsByWorktree[WORKTREE_ID].map((tab) => tab.id)).toEqual(['tab-b'])
    // Why: the fence is what makes the deletion survive the renderer's next write.
    expect(next.terminalTopologyRevisionByRepoId?.[REPO_ID]).toBe(4)
    // Why: creation already flushes synchronously; leaving deletion on the 1s debounce
    // is how a quit right after the click loses it.
    expect(store.flushOrThrow).toHaveBeenCalledOnce()
  })

  it('writes to the host partition the caller names', () => {
    const store = createStore(seededSession())
    store.sessionsByHost.set('runtime:remote-1', seededSession())
    registerSessionHandlers(store as never)

    invokeRetire({ closures: [{ worktreeId: WORKTREE_ID, tabId: 'tab-a' }] }, 'runtime:remote-1')

    expect(store.sessionsByHost.get('runtime:remote-1')!.tabsByWorktree[WORKTREE_ID]).toHaveLength(
      1
    )
    expect(store.sessionsByHost.get('local')!.tabsByWorktree[WORKTREE_ID]).toHaveLength(2)
  })

  it.each([
    ['no argument', undefined],
    ['an empty list', { closures: [] }],
    ['a non-array', { closures: 'tab-a' }],
    ['entries missing ids', { closures: [{ worktreeId: WORKTREE_ID }, { tabId: 'tab-a' }] }]
  ])('writes nothing for %s', (_label, args) => {
    const store = createStore(seededSession())
    registerSessionHandlers(store as never)

    invokeRetire(args)

    expect(store.setWorkspaceSession).not.toHaveBeenCalled()
    expect(store.flushOrThrow).not.toHaveBeenCalled()
  })

  it('writes nothing when the tab is already gone', () => {
    const store = createStore(seededSession())
    registerSessionHandlers(store as never)

    invokeRetire({ closures: [{ worktreeId: WORKTREE_ID, tabId: 'never-existed' }] })

    expect(store.setWorkspaceSession).not.toHaveBeenCalled()
    expect(store.flushOrThrow).not.toHaveBeenCalled()
  })

  // The tab is only the surface. Its PTYs outlive the app on purpose, so a close that
  // stops at de-persisting leaves live processes for startup recovery to adopt back.
  it('ends the tab sessions before de-persisting, naming its PTYs from the durable layout', () => {
    const store = createStore(seededSession())
    const terminate = vi.fn(() => {
      expect(store.setWorkspaceSession).not.toHaveBeenCalled()
    })
    registerSessionHandlers(store as never, { terminateSessionsForClosedTerminalTabs: terminate })

    invokeRetire({ closures: [{ worktreeId: WORKTREE_ID, tabId: 'tab-a' }] })

    expect(terminate).toHaveBeenCalledWith([
      { worktreeId: WORKTREE_ID, tabId: 'tab-a', ptyIds: ['pty-tab-a'] }
    ])
    expect(store.flushOrThrow).toHaveBeenCalledOnce()
  })

  it('still ends the sessions of a tab the host copy no longer lists', () => {
    const store = createStore(seededSession())
    const terminate = vi.fn()
    registerSessionHandlers(store as never, { terminateSessionsForClosedTerminalTabs: terminate })

    invokeRetire({ closures: [{ worktreeId: WORKTREE_ID, tabId: 'never-existed' }] })

    expect(terminate).toHaveBeenCalledWith([
      { worktreeId: WORKTREE_ID, tabId: 'never-existed', ptyIds: [] }
    ])
  })
})

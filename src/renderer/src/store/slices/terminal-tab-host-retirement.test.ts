import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockKill = vi.fn().mockResolvedValue(undefined)
const mockRetireClosedTerminalTabs = vi.fn().mockResolvedValue(undefined)

vi.stubGlobal('window', {
  api: {
    pty: { kill: mockKill },
    runtime: { call: vi.fn() },
    runtimeEnvironments: { call: vi.fn() },
    session: { retireClosedTerminalTabs: mockRetireClosedTerminalTabs }
  }
})

import { createTestStore, makeWorktree, makeTab, seedStore } from './store-test-helpers'

function createStoreWithTab() {
  const store = createTestStore()
  seedStore(store, {
    worktreesByRepo: {
      repo1: [makeWorktree({ id: 'wt-1', repoId: 'repo1', path: '/repo/wt-1' })]
    },
    tabsByWorktree: {
      'wt-1': [
        makeTab({ id: 'tab-1', worktreeId: 'wt-1', ptyId: 'pty-1' }),
        makeTab({ id: 'tab-2', worktreeId: 'wt-1', ptyId: 'pty-2' })
      ]
    }
  })
  return store
}

describe('closing a terminal tab tells the host', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockKill.mockResolvedValue(undefined)
    mockRetireClosedTerminalTabs.mockResolvedValue(undefined)
  })

  // Why: the host rebases renderer session writes onto its own terminal membership, so
  // a close that never reaches it is undone and the tab reappears on the next launch.
  it('retires the closed tab on the host', async () => {
    const store = createStoreWithTab()

    store.getState().closeTab('tab-1')

    await vi.waitFor(() => expect(mockRetireClosedTerminalTabs).toHaveBeenCalled())
    expect(mockRetireClosedTerminalTabs).toHaveBeenCalledWith(
      { closures: [{ worktreeId: 'wt-1', tabId: 'tab-1' }] },
      'local'
    )
  })

  it('does not retire a tab closed because its PTY exited', async () => {
    const store = createStoreWithTab()

    // Why: a pty-exit close is the host's own observation; it already owns that
    // retirement, and re-issuing it here would race its incarnation checks.
    store.getState().closeTab('tab-1', { reason: 'pty-exit' })

    await vi.waitFor(() => expect(store.getState().tabsByWorktree['wt-1']).toHaveLength(1))
    expect(mockRetireClosedTerminalTabs).not.toHaveBeenCalled()
  })

  it('leaves a remote-owned close to its own host lane', async () => {
    const store = createStoreWithTab()

    // Why: that lane closes the tab on the runtime host over RPC, and the host's next
    // snapshot decides the local mirror — retiring here would fence a copy it owns.
    store.getState().closeTab('tab-1', { remoteCloseOwnedByHost: true })

    await vi.waitFor(() => expect(store.getState().tabsByWorktree['wt-1']).toHaveLength(1))
    expect(mockRetireClosedTerminalTabs).not.toHaveBeenCalled()
  })

  it('keeps the close working when the host retirement rejects', async () => {
    const store = createStoreWithTab()
    mockRetireClosedTerminalTabs.mockRejectedValue(new Error('disk full'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => store.getState().closeTab('tab-1')).not.toThrow()

    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    expect(store.getState().tabsByWorktree['wt-1'].map((tab) => tab.id)).toEqual(['tab-2'])
    warn.mockRestore()
  })
})

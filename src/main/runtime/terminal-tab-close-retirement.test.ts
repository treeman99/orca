import { describe, expect, it } from 'vitest'
import { getDefaultWorkspaceSession } from '../../shared/constants'
import type { Tab, WorkspaceSessionState } from '../../shared/types'
import { sanitizeWorkspaceSessionTerminalRetirements } from './mobile-session-terminal-persistence-retirement'
import { retireClosedTerminalTabsFromPersistence } from './terminal-tab-close-retirement'

const WORKTREE_ID = 'repo::/worktree'
const REPO_ID = 'repo'

function terminalTab(id: string, ptyId: string | null, sortOrder: number) {
  return {
    id,
    ptyId,
    worktreeId: WORKTREE_ID,
    title: 'Terminal',
    customTitle: null,
    color: null,
    sortOrder,
    createdAt: 1
  }
}

function unifiedTerminalTab(id: string, sortOrder: number): Tab {
  return {
    id,
    entityId: id,
    groupId: 'group-1',
    worktreeId: WORKTREE_ID,
    contentType: 'terminal',
    label: 'Terminal',
    customLabel: null,
    color: null,
    sortOrder,
    createdAt: 1
  }
}

/**
 * A session in the state the bug needs: the repo's topology fence is armed, and the
 * tabs were restored from a previous launch, so nothing in this run has attached a PTY
 * to them and there is no incarnation binding to match.
 */
function restoredSession(): WorkspaceSessionState {
  return {
    ...getDefaultWorkspaceSession(),
    activeTabId: 'terminal-a',
    activeTabIdByWorktree: { [WORKTREE_ID]: 'terminal-a' },
    tabsByWorktree: {
      [WORKTREE_ID]: [terminalTab('terminal-a', 'pty-a', 0), terminalTab('terminal-b', 'pty-b', 1)]
    },
    terminalLayoutsByTabId: {
      'terminal-a': {
        root: { type: 'leaf' as const, leafId: 'left' },
        activeLeafId: 'left',
        expandedLeafId: null,
        ptyIdsByLeafId: { left: 'pty-a' }
      },
      'terminal-b': {
        root: { type: 'leaf' as const, leafId: 'left' },
        activeLeafId: 'left',
        expandedLeafId: null,
        ptyIdsByLeafId: { left: 'pty-b' }
      }
    },
    unifiedTabs: {
      [WORKTREE_ID]: [unifiedTerminalTab('terminal-a', 0), unifiedTerminalTab('terminal-b', 1)]
    },
    terminalTopologyRevisionByRepoId: { [REPO_ID]: 7 }
  }
}

describe('closing a terminal tab from the desktop', () => {
  it('removes the tab from the host copy and advances the fence', () => {
    const session = restoredSession()

    const next = retireClosedTerminalTabsFromPersistence(session, [
      { worktreeId: WORKTREE_ID, tabId: 'terminal-a' }
    ])

    expect(next.tabsByWorktree[WORKTREE_ID].map((tab) => tab.id)).toEqual(['terminal-b'])
    expect(next.unifiedTabs?.[WORKTREE_ID]?.map((tab) => tab.id)).toEqual(['terminal-b'])
    expect(next.terminalLayoutsByTabId['terminal-a']).toBeUndefined()
    expect(next.activeTabIdByWorktree?.[WORKTREE_ID]).toBe('terminal-b')
    expect(next.terminalTopologyRevisionByRepoId?.[REPO_ID]).toBe(8)
  })

  // The actual bug: the renderer's own write is rebased onto host membership, so the
  // deletion only sticks if the host applied it first. Without the retirement the
  // rebase restores the tab and it comes back on the next launch.
  it('survives the rebase that discards a renderer-only deletion', () => {
    const session = restoredSession()
    const rendererWrite: WorkspaceSessionState = {
      ...session,
      tabsByWorktree: { [WORKTREE_ID]: [terminalTab('terminal-b', 'pty-b', 1)] },
      unifiedTabs: { [WORKTREE_ID]: [unifiedTerminalTab('terminal-b', 1)] }
    }

    const withoutHostRetirement = sanitizeWorkspaceSessionTerminalRetirements(
      rendererWrite,
      session
    )
    expect(withoutHostRetirement.tabsByWorktree[WORKTREE_ID].map((tab) => tab.id)).toEqual([
      'terminal-a',
      'terminal-b'
    ])

    const hostRetired = retireClosedTerminalTabsFromPersistence(session, [
      { worktreeId: WORKTREE_ID, tabId: 'terminal-a' }
    ])
    const withHostRetirement = sanitizeWorkspaceSessionTerminalRetirements(
      rendererWrite,
      hostRetired
    )
    expect(withHostRetirement.tabsByWorktree[WORKTREE_ID].map((tab) => tab.id)).toEqual([
      'terminal-b'
    ])
  })

  it('retires a tab that never bound a PTY in this run', () => {
    const session = restoredSession()
    // Why: a restored-but-never-opened tab is exactly the case with no runtime
    // evidence — every PTY-matching guard would refuse it.
    const noBindings: WorkspaceSessionState = {
      ...session,
      terminalLayoutsByTabId: {
        ...session.terminalLayoutsByTabId,
        'terminal-a': {
          root: { type: 'leaf' as const, leafId: 'left' },
          activeLeafId: 'left',
          expandedLeafId: null,
          ptyIdsByLeafId: {}
        }
      }
    }

    const next = retireClosedTerminalTabsFromPersistence(noBindings, [
      { worktreeId: WORKTREE_ID, tabId: 'terminal-a' }
    ])

    expect(next.tabsByWorktree[WORKTREE_ID].map((tab) => tab.id)).toEqual(['terminal-b'])
  })

  it('retires a split tab whole, leaving no pane incarnation behind', () => {
    const session: WorkspaceSessionState = {
      ...restoredSession(),
      terminalPtyIncarnationsByPaneKey: {
        'terminal-a:left': 'incarnation-a',
        'terminal-a:right': 'incarnation-b',
        'terminal-b:left': 'incarnation-c'
      }
    }
    session.terminalLayoutsByTabId['terminal-a'] = {
      root: {
        type: 'split',
        direction: 'vertical',
        ratio: 0.5,
        first: { type: 'leaf', leafId: 'left' },
        second: { type: 'leaf', leafId: 'right' }
      },
      activeLeafId: 'left',
      expandedLeafId: null,
      ptyIdsByLeafId: { left: 'pty-a', right: 'pty-a2' }
    }

    const next = retireClosedTerminalTabsFromPersistence(session, [
      { worktreeId: WORKTREE_ID, tabId: 'terminal-a' }
    ])

    expect(next.tabsByWorktree[WORKTREE_ID].map((tab) => tab.id)).toEqual(['terminal-b'])
    expect(next.terminalPtyIncarnationsByPaneKey).toEqual({ 'terminal-b:left': 'incarnation-c' })
  })

  it('leaves an unrelated tab alone and is idempotent', () => {
    const session = restoredSession()

    const once = retireClosedTerminalTabsFromPersistence(session, [
      { worktreeId: WORKTREE_ID, tabId: 'terminal-a' }
    ])
    const twice = retireClosedTerminalTabsFromPersistence(once, [
      { worktreeId: WORKTREE_ID, tabId: 'terminal-a' }
    ])

    expect(twice.tabsByWorktree[WORKTREE_ID].map((tab) => tab.id)).toEqual(['terminal-b'])
    expect(twice.terminalLayoutsByTabId['terminal-b']).toBeDefined()
  })
})

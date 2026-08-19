import { describe, expect, it } from 'vitest'
import { getDefaultWorkspaceSession } from '../../shared/constants'
import type { Tab } from '../../shared/tab-types'
import type { WorkspaceSessionState } from '../../shared/workspace-session-state-types'
import { sanitizeWorkspaceSessionTerminalRetirements } from './mobile-session-terminal-persistence-retirement'
import {
  collectPersistedTerminalTabPtyIds,
  retireClosedTerminalTabsFromPersistence
} from './terminal-tab-close-retirement'

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

function sleepingAgent(paneKey: string, tabId: string) {
  return {
    paneKey,
    tabId,
    worktreeId: WORKTREE_ID,
    agent: 'codex' as const,
    providerSession: { key: 'session_id' as const, id: `session-${tabId}` },
    prompt: 'continue',
    state: 'working' as const,
    capturedAt: 1,
    updatedAt: 1,
    origin: 'live' as const
  }
}

function sessionWithSleepingAgents(): WorkspaceSessionState {
  return {
    ...restoredSession(),
    sleepingAgentSessionsByPaneKey: {
      'terminal-a:left': sleepingAgent('terminal-a:left', 'terminal-a'),
      'terminal-a:right': sleepingAgent('terminal-a:right', 'terminal-a'),
      'terminal-b:left': sleepingAgent('terminal-b:left', 'terminal-b')
    }
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

  // A sleeping record is a standing order to rebuild the tab and resume the agent into
  // it on the next worktree activation, so leaving one behind turns a close into a restart.
  it('unparks the agent sessions of the closed tab and only those', () => {
    const next = retireClosedTerminalTabsFromPersistence(sessionWithSleepingAgents(), [
      { worktreeId: WORKTREE_ID, tabId: 'terminal-a' }
    ])

    expect(Object.keys(next.sleepingAgentSessionsByPaneKey ?? {})).toEqual(['terminal-b:left'])
  })

  it('unparks agent sessions even when the tab is already gone from the host copy', () => {
    const session = sessionWithSleepingAgents()
    const retired = retireClosedTerminalTabsFromPersistence(session, [
      { worktreeId: WORKTREE_ID, tabId: 'terminal-a' }
    ])
    // Why: the record survives its tab, and a second close is the only thing that would
    // reach it — the membership guard used to return before ever looking.
    const orphaned: WorkspaceSessionState = {
      ...retired,
      sleepingAgentSessionsByPaneKey: session.sleepingAgentSessionsByPaneKey
    }

    const next = retireClosedTerminalTabsFromPersistence(orphaned, [
      { worktreeId: WORKTREE_ID, tabId: 'terminal-a' }
    ])

    expect(Object.keys(next.sleepingAgentSessionsByPaneKey ?? {})).toEqual(['terminal-b:left'])
  })

  it('names every pane PTY of a split tab so the close can end all of them', () => {
    const session = restoredSession()
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

    expect(collectPersistedTerminalTabPtyIds(session, WORKTREE_ID, 'terminal-a').sort()).toEqual([
      'pty-a',
      'pty-a2'
    ])
  })

  it('names the PTY of a pre-layout tab that only records it on the tab row', () => {
    const session = restoredSession()
    delete session.terminalLayoutsByTabId['terminal-b']

    expect(collectPersistedTerminalTabPtyIds(session, WORKTREE_ID, 'terminal-b')).toEqual(['pty-b'])
  })

  it('names nothing for a tab that is not there', () => {
    expect(collectPersistedTerminalTabPtyIds(restoredSession(), WORKTREE_ID, 'gone')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import type { TerminalLayoutSnapshot, TerminalTab } from '../../../../shared/terminal-tab-types'
import type { RetainedAgentEntry } from '@/store/slices/agent-status'
import { applyAgentRowLineage } from '@/components/dashboard/agent-row-lineage'
import { buildWorktreeAgentRows } from './worktree-agent-rows'

const COORD_LEAF = '11111111-1111-4111-8111-111111111111'
const WORKER_LEAF = '22222222-2222-4222-8222-222222222222'
const OTHER_LEAF = '33333333-3333-4333-8333-333333333333'
const COORD_PANE = makePaneKey('tab-coord', COORD_LEAF)
const WORKER_PANE = makePaneKey('tab-worker', WORKER_LEAF)

function makeTab(id: string, overrides?: Partial<TerminalTab>): TerminalTab {
  return {
    id,
    worktreeId: 'wt-1',
    ptyId: `pty-${id}`,
    title: 'Terminal',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 0,
    ...overrides
  }
}

function makeWorker(overrides?: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    paneKey: WORKER_PANE,
    state: 'working',
    stateStartedAt: 2000,
    updatedAt: 2500,
    stateHistory: [{ state: 'working', prompt: 'do the task', startedAt: 2000 }],
    prompt: 'do the task',
    agentType: 'opencode',
    worktreeId: 'wt-1',
    orchestration: {
      taskId: 'task-1',
      dispatchId: 'dispatch-1',
      parentPaneKey: COORD_PANE,
      coordinatorHandle: 'term_coord'
    },
    ...overrides
  }
}

function makeCoordinator(overrides?: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    paneKey: COORD_PANE,
    state: 'working',
    stateStartedAt: 1000,
    updatedAt: 1500,
    stateHistory: [{ state: 'working', prompt: '/orchestration ship it', startedAt: 1000 }],
    prompt: '/orchestration ship it',
    agentType: 'claude',
    worktreeId: 'wt-1',
    toolName: 'Bash',
    ...overrides
  }
}

function singleLeafLayout(leafId: string): TerminalLayoutSnapshot {
  return { root: { type: 'leaf', leafId }, activeLeafId: leafId, expandedLeafId: null }
}

function buildRows(args: {
  entries: AgentStatusEntry[]
  tabs?: TerminalTab[]
  retained?: RetainedAgentEntry[]
  ptyIdsByTabId?: Record<string, string[]>
  terminalLayoutsByTabId?: Record<string, TerminalLayoutSnapshot | undefined>
}) {
  return buildWorktreeAgentRows({
    tabs: args.tabs ?? [makeTab('tab-coord'), makeTab('tab-worker')],
    entries: args.entries,
    retained: args.retained ?? [],
    ptyIdsByTabId: args.ptyIdsByTabId ?? { 'tab-coord': ['pty-coord'], 'tab-worker': ['pty-w'] },
    terminalLayoutsByTabId: args.terminalLayoutsByTabId,
    now: 10_000
  })
}

describe('coordinator fallback rows', () => {
  // The reported bug: the coordinator's own status row vanished (dropped, fenced, retired)
  // while its opencode worker kept reporting, so the card showed a worker with no owner.
  it('keeps a coordinator row on the card while a live worker still names its pane', () => {
    const rows = buildRows({ entries: [makeWorker()] })
    const coordinator = rows.find((row) => row.paneKey === COORD_PANE)
    expect(coordinator).toMatchObject({
      rowSource: 'live',
      state: 'unverifiable',
      startedAt: 2000,
      tab: expect.objectContaining({ id: 'tab-coord' })
    })
    expect(coordinator?.entry.prompt).toBe('Orchestration coordinator')
    // Why the worker's dispatch time: it is the last moment anything proved the pane acted.
    expect(coordinator?.entry.updatedAt).toBe(2000)
    // The worker nests under it again, exactly as it does under a real coordinator row.
    const lineage = applyAgentRowLineage(rows)
    expect(lineage.map((row) => [row.paneKey, row.lineage.depth])).toEqual([
      [COORD_PANE, 0],
      [WORKER_PANE, 1]
    ])
  })

  it("never shadows the coordinator's real status row", () => {
    const rows = buildRows({ entries: [makeCoordinator(), makeWorker()] })
    const coordinatorRows = rows.filter((row) => row.paneKey === COORD_PANE)
    expect(coordinatorRows).toHaveLength(1)
    expect(coordinatorRows[0].entry.prompt).toBe('/orchestration ship it')
    expect(coordinatorRows[0].state).toBe('working')
  })

  it('is not synthesized when the coordinator tab has no live PTY', () => {
    const rows = buildRows({
      entries: [makeWorker()],
      ptyIdsByTabId: { 'tab-worker': ['pty-w'] }
    })
    expect(rows.map((row) => row.paneKey)).toEqual([WORKER_PANE])
  })

  it('is not synthesized for a completed worker', () => {
    const rows = buildRows({ entries: [makeWorker({ state: 'done' })] })
    expect(rows.map((row) => row.paneKey)).toEqual([WORKER_PANE])
  })

  it('yields to a retained completion row for the same pane', () => {
    const retained: RetainedAgentEntry = {
      entry: makeCoordinator({ state: 'done' }),
      worktreeId: 'wt-1',
      tab: makeTab('tab-coord'),
      agentType: 'claude',
      startedAt: 1000
    }
    const rows = buildRows({ entries: [makeWorker()], retained: [retained] })
    const coordinatorRows = rows.filter((row) => row.paneKey === COORD_PANE)
    expect(coordinatorRows).toHaveLength(1)
    expect(coordinatorRows[0].rowSource).toBe('retained')
  })

  it('is not synthesized when the coordinator tab belongs to another card', () => {
    const rows = buildRows({ entries: [makeWorker()], tabs: [makeTab('tab-worker')] })
    expect(rows.map((row) => row.paneKey)).toEqual([WORKER_PANE])
  })

  it('is not synthesized once the layout no longer holds the coordinator pane', () => {
    const rows = buildRows({
      entries: [makeWorker()],
      terminalLayoutsByTabId: { 'tab-coord': singleLeafLayout(OTHER_LEAF) }
    })
    expect(rows.map((row) => row.paneKey)).toEqual([WORKER_PANE])
  })

  it('folds several workers into one coordinator row dated by the latest dispatch', () => {
    const second = makeWorker({
      paneKey: makePaneKey('tab-worker-2', OTHER_LEAF),
      stateStartedAt: 3000,
      stateHistory: [{ state: 'working', prompt: 'second', startedAt: 3000 }],
      orchestration: { taskId: 'task-2', dispatchId: 'dispatch-2', parentPaneKey: COORD_PANE }
    })
    const rows = buildRows({
      entries: [makeWorker(), second],
      tabs: [makeTab('tab-coord'), makeTab('tab-worker'), makeTab('tab-worker-2')],
      ptyIdsByTabId: { 'tab-coord': ['p1'], 'tab-worker': ['p2'], 'tab-worker-2': ['p3'] }
    })
    const coordinatorRows = rows.filter((row) => row.paneKey === COORD_PANE)
    expect(coordinatorRows).toHaveLength(1)
    expect(coordinatorRows[0]).toMatchObject({ startedAt: 2000 })
    expect(coordinatorRows[0].entry.updatedAt).toBe(3000)
    expect(rows[0].paneKey).toBe(COORD_PANE)
  })
})

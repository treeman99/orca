import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { translate } from '@/i18n/i18n'
import { tabHasLivePty } from '@/lib/tab-has-live-pty'
import type { RetainedAgentEntry } from '@/store/slices/agent-status'
import type {
  AgentStatusEntry,
  AgentStatusOrchestrationContext
} from '../../../../shared/agent-status-types'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type {
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode,
  TerminalTab
} from '../../../../shared/terminal-tab-types'
import { effectiveWorktreeAgentRowStartedAt } from './worktree-agent-row-fallback-tab'
import { entryWithRuntimeOrchestration } from './worktree-agent-row-orchestration'
import { resolveRowAgentType } from './worktree-agent-row-type'

function layoutHasLeaf(node: TerminalPaneLayoutNode | null | undefined, leafId: string): boolean {
  if (!node) {
    return false
  }
  if (node.type === 'leaf') {
    return node.leafId === leafId
  }
  return layoutHasLeaf(node.first, leafId) || layoutHasLeaf(node.second, leafId)
}

type CoordinatorEvidence = {
  tab: TerminalTab
  /** Earliest worker start — the coordinator was already running by then. */
  startedAt: number
  /** Latest worker turn start — the last moment a dispatch proves the coordinator acted. */
  lastDispatchAt: number
}

/**
 * Coordinator rows synthesized from the workers that still name them.
 *
 * Why: an orchestration worker row carries `orchestration.parentPaneKey`, and the sidebar
 * only nests it under that pane when a row for the pane exists. The coordinator's own row is
 * a hook status like any other, so anything that drops or fences that one entry — a stale
 * retirement, a suppressed status stream, a completed-agent hibernation — leaves the card
 * showing the worker alone, as if the coordinator were gone while its PTY keeps running.
 * A live worker naming a live pane is evidence that pane is still coordinating; keep it on
 * the card so the run stays readable and clickable. The row claims nothing about what the
 * coordinator is doing: it reads `unverifiable`, dated from the last dispatch, and gives way
 * to the real row the moment a hook status lands again (that row is emitted first and wins).
 *
 * Deliberately not synthesized: a coordinator whose tab has no live PTY (nothing runs
 * behind it), one that already has a retained completion row (it finished), and one named
 * only by completed workers (a done dispatch proves nothing about the present).
 */
export function buildCoordinatorFallbackRows(args: {
  tabs: readonly TerminalTab[]
  entries: readonly AgentStatusEntry[]
  retained: readonly RetainedAgentEntry[]
  /** Pane keys that already have a row this build; a synthesized row never shadows one. */
  rowPaneKeys: ReadonlySet<string>
  ptyIdsByTabId: Record<string, string[]>
  terminalLayoutsByTabId?: Record<string, TerminalLayoutSnapshot | undefined>
  runtimeAgentOrchestrationByPaneKey?: Record<string, AgentStatusOrchestrationContext>
}): DashboardAgentRow[] {
  const tabsById = new Map(args.tabs.map((tab) => [tab.id, tab] as const))
  const retainedPaneKeys = new Set(args.retained.map((retained) => retained.entry.paneKey))
  const evidenceByPaneKey = new Map<string, CoordinatorEvidence>()

  for (const entry of args.entries) {
    const worker = entryWithRuntimeOrchestration(entry, args.runtimeAgentOrchestrationByPaneKey)
    const parentPaneKey = worker.orchestration?.parentPaneKey
    if (
      !parentPaneKey ||
      parentPaneKey === worker.paneKey ||
      worker.state === 'done' ||
      args.rowPaneKeys.has(parentPaneKey) ||
      retainedPaneKeys.has(parentPaneKey)
    ) {
      continue
    }
    const parsed = parsePaneKey(parentPaneKey)
    const tab = parsed ? tabsById.get(parsed.tabId) : undefined
    if (!parsed || !tab || !tabHasLivePty(args.ptyIdsByTabId, tab.id)) {
      continue
    }
    // Why: a persisted layout is the renderer's own map of the tab; a leaf it no longer
    // holds is a pane that closed, whatever a worker still remembers about it.
    const layout = args.terminalLayoutsByTabId?.[tab.id]
    if (layout?.root && !layoutHasLeaf(layout.root, parsed.leafId)) {
      continue
    }
    const startedAt = effectiveWorktreeAgentRowStartedAt(worker)
    const existing = evidenceByPaneKey.get(parentPaneKey)
    evidenceByPaneKey.set(parentPaneKey, {
      tab,
      startedAt: Math.min(existing?.startedAt ?? startedAt, startedAt),
      lastDispatchAt: Math.max(existing?.lastDispatchAt ?? 0, worker.stateStartedAt)
    })
  }

  const rows: DashboardAgentRow[] = []
  for (const [paneKey, evidence] of evidenceByPaneKey) {
    const parsed = parsePaneKey(paneKey)!
    const entry: AgentStatusEntry = {
      paneKey,
      tabId: parsed.tabId,
      worktreeId: evidence.tab.worktreeId,
      state: 'working',
      prompt: translate(
        'auto.components.sidebar.worktree.agent.coordinator.fallback.rows.2afb8027ef',
        'Orchestration coordinator'
      ),
      updatedAt: evidence.lastDispatchAt,
      evidenceObservedAt: evidence.lastDispatchAt,
      stateStartedAt: evidence.startedAt,
      stateHistory: [],
      terminalTitle: evidence.tab.title
    }
    rows.push({
      paneKey,
      entry,
      tab: evidence.tab,
      agentType: resolveRowAgentType(entry, evidence.tab),
      rowSource: 'live',
      // Why unverifiable, never working: the only thing known is that a live pane still has
      // workers reporting to it. Silence is not evidence (ssh-execution-boundary.md).
      state: 'unverifiable',
      startedAt: evidence.startedAt
    })
  }
  return rows
}

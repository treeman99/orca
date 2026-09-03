import type { TuiAgent } from '../../shared/tui-agent'
import { TUI_AGENT_CONFIG } from '../../shared/tui-agent-config'
import { worktreeIdsEqual } from '../../shared/worktree/id'
import { OrcaRuntimeWithResolveWaiter } from './orca-runtime-resolve-waiter'
import { waitForWorktreeStartupDraft } from './runtime-worktree-startup-readiness'
import type { LegacyWorkerRecoveryCandidate } from './runtime-legacy-worker-terminal-recovery-types'

/**
 * Runtime members this fork owns. Kept at the tail of the class chain so an upstream
 * split of any layer below cannot silently drop them — a rebase that loses this file
 * fails typecheck at the RPC methods that call these.
 */
export class OrcaRuntimeForkSurface extends OrcaRuntimeWithResolveWaiter {
  /** Settings gate for closing a worker tab once its dispatch settles. */
  shouldAutoCloseSettledWorkerTerminals(): boolean {
    return this.store?.getSettings()?.autoCloseCompletedOrchestrationWorkerTabs === true
  }

  // Why not a fixed delay: opencode under ConPTY cannot receive a bracketed paste until its
  // composer has rendered, so dispatch waits on the agent's own ready signal instead.
  async waitForAgentComposerReady(handle: string, agent: TuiAgent): Promise<boolean> {
    if (!TUI_AGENT_CONFIG[agent].draftPasteReadySignal) {
      return true
    }
    const ptyId = await waitForWorktreeStartupDraft(
      this.getWorktreeStartupReadinessHost(),
      handle,
      agent
    )
    return ptyId !== null
  }

  /**
   * End every session bound to a terminal tab the user closed.
   *
   * De-persisting the tab is not enough. Its PTYs outlive the app on purpose — the local
   * daemon is relocated so app updates cannot kill it — and a worker tab additionally
   * keeps a recoverable `worker_dispatches` row, which nothing in the close path settles.
   * Startup recovery then finds a live PTY with no published surface and re-creates the
   * tab with `pendingActivationSpawn`, so the close reads as "came back and re-ran".
   */
  terminateSessionsForClosedTerminalTabs(
    closures: readonly { worktreeId: string; tabId: string; ptyIds: readonly string[] }[]
  ): void {
    if (closures.length === 0) {
      return
    }
    for (const closure of closures) {
      for (const ptyId of closure.ptyIds) {
        this.killClosedTerminalTabPty(ptyId)
      }
    }
    for (const candidate of this.legacyWorkerRecovery.prepare().candidates) {
      const closed = closures.some(
        (closure) =>
          closure.tabId === candidate.tabId &&
          worktreeIdsEqual(closure.worktreeId, candidate.worktreeId)
      )
      if (!closed) {
        continue
      }
      // Why: the plan is built from the DB, so it names PTYs the session no longer maps
      // — a tab restored but never attached has no layout entry for its own worker.
      this.killClosedTerminalTabPty(candidate.ptyId)
      // Why: reuse the exited-terminal settlement rather than a bespoke one. A deliberate
      // close and an exited worker leave orchestration in the same place, and that lane
      // already keeps the task redispatchable instead of failing it outright.
      this.resolveExitedLegacyWorkerTerminal(candidate)
    }
  }

  /** Settle one worker dispatch whose terminal the user closed. */
  private resolveExitedLegacyWorkerTerminal(candidate: LegacyWorkerRecoveryCandidate): boolean {
    this.rollbackLegacyWorkerTerminalSurface(candidate)
    if (!this.legacyWorkerRecoveryPersistence.reconcileMissing(candidate)) {
      return false
    }
    void this.legacyWorkerRecoveryPersistence
      .persist([{ candidate, resolution: 'exited' }])
      .then((persistedDispatchIds) => {
        if (persistedDispatchIds.has(candidate.dispatchId)) {
          this.notifier?.resolveLegacyWorkerTerminalRecovery?.(candidate.paneKey, 'exited')
        }
      })
      .catch((error: unknown) => {
        console.warn('[orchestration] failed to persist a closed worker tab settlement', {
          dispatchId: candidate.dispatchId,
          error
        })
      })
    return true
  }

  private killClosedTerminalTabPty(ptyId: string): void {
    // Why: same rule `pty:kill` enforces — a `remote:` id names a runtime terminal owned
    // by another host, and routing it here would target the local provider instead.
    if (!ptyId || ptyId.startsWith('remote:')) {
      return
    }
    try {
      this.ptyController?.kill(ptyId)
    } catch (error) {
      // Why: a close must not reject into the UI, and an already-dead PTY is the success
      // case. Logged because a persistent failure is what leaves an adoptable orphan.
      console.warn('[terminal-retirement] failed to kill PTY for a closed tab', { ptyId, error })
    }
  }
}

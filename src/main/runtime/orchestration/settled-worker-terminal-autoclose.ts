import type { OrcaRuntimeService } from '../orca-runtime'
import { writeDiagnosticLine } from '../../observability/diagnostic-log'
import { completeWorkerTerminalRelease } from '../rpc/methods/orchestration-worker-release-completion'

/**
 * Close a worker's terminal — and with it its tab and its pane — the moment the
 * worker's own `worker_done` settles, for users who asked not to wait on the
 * coordinator's `worker-release`.
 *
 * Why the durable release path and not a bare terminal close: release is the only
 * route that pins the output archive first, refuses a terminal the user has taken
 * over by typing in it, and settles ownership so recovery cannot reopen it. It is
 * exactly what a coordinator running `worker-release` would do, just unprompted.
 *
 * Opt-in for one reason: the orchestration contract also allows handing the exact
 * terminal to a follow-up Dispatch, and that transfer is impossible once it is gone.
 */
export function autoCloseSettledWorkerTerminal(
  runtime: OrcaRuntimeService,
  dispatchId: string
): void {
  if (!runtime.shouldAutoCloseSettledWorkerTerminals()) {
    return
  }
  const db = runtime.getOrchestrationDb()
  if (db.getFederatedDispatch(dispatchId)) {
    // The worker server owns that terminal; a home-side close would be a guess.
    return
  }
  void (async () => {
    try {
      const requested = db.requestWorkerTerminalRelease(dispatchId)
      if (requested.disposition !== 'requested') {
        writeDiagnosticLine('worker-autoclose', {
          dispatch: dispatchId,
          state: requested.disposition,
          reason: requested.disposition === 'retained' ? requested.reason : 'none'
        })
        return
      }
      const receipt = await completeWorkerTerminalRelease({
        runtime,
        db,
        dispatchId,
        resource: requested.resource
      })
      writeDiagnosticLine('worker-autoclose', {
        dispatch: dispatchId,
        state: receipt.state,
        action: receipt.processAction,
        reason: receipt.reason ?? 'none'
      })
    } catch (error) {
      // Advisory only: the coordinator's own worker-release stays the authority.
      writeDiagnosticLine('worker-autoclose', {
        dispatch: dispatchId,
        state: 'error',
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  })()
}

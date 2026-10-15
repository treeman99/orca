// Fork-owned: hands placement the coordinator a dispatched worker's column anchors to. workers.ts
// imports this under upstream's name, so both it and local-worker-start.ts stay byte-identical.
import { resolveDispatchCallerWorktreeId } from '../../orchestration-caller-workspace'
import { runWithWorkerStartCoordinator } from '../../orchestration-worker-pane-anchor'
import { startLocalWorker } from './local-worker-start'

export async function startLocalWorkerWithPaneAnchor(
  args: Parameters<typeof startLocalWorker>[0]
): Promise<unknown> {
  const { runtime, params, callerSession, coordinator } = args
  // Why swallowed: upstream resolves the same id itself, so it owns the error a failure reports.
  const coordinatorWorktreeId = await resolveDispatchCallerWorktreeId(
    runtime,
    params.from,
    callerSession
  ).catch(() => null)
  if (coordinatorWorktreeId === null) {
    return startLocalWorker(args)
  }
  const coordinatorPane = coordinator?.paneKey ?? null
  return runWithWorkerStartCoordinator({ coordinatorPane, coordinatorWorktreeId }, () =>
    startLocalWorker(args)
  )
}

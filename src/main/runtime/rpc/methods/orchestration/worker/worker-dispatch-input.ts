// The dispatch_input stage of worker-start, as this fork runs it: wait for the agent's composer,
// deliver upstream's preamble, and record both what was written and how it settled.
//
// Lifted out of local-worker-start.ts because that file sits at the max-lines cap and this is the
// one stage with its own ordering rule — the composer wait has to sit between readiness and the
// write, and a reader who does not see the three steps together will move it.

import type { TuiAgent } from '../../../../../../shared/tui-agent'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { buildDispatchInputEffect } from '../../orchestration-dispatch-input-effect'
import {
  awaitWorkerComposer,
  recordWorkerPromptDispatch
} from '../../orchestration-worker-prompt-diagnostics'
import { deliverWorkerDispatchPreamble } from './deliver-worker-dispatch-preamble'
import type { WorkerEffect } from './worker-topology'

type Args = Parameters<typeof deliverWorkerDispatchPreamble>[0] & {
  agent: TuiAgent | null | undefined
  effects: WorkerEffect[]
}

export async function deliverWorkerDispatchInput(
  args: Args
): Promise<Awaited<ReturnType<typeof deliverWorkerDispatchPreamble>>> {
  const { runtime, structuredSession, terminalHandle, taskId, agent, effects } = args
  // Why after tui-idle and not instead of it: tui-idle proves an agent owns the pane, but for a
  // pane whose title Orca cannot parse yet it can settle on a generic ready prompt — before the
  // agent's composer exists. A paste written into that window is dropped when the TUI drains
  // stdin at init. A structured session has no composer to wait on.
  if (!structuredSession && agent) {
    await awaitWorkerComposer(runtime as OrcaRuntimeService, {
      taskId,
      agent,
      handle: terminalHandle
    })
  }
  const delivery = await deliverWorkerDispatchPreamble(args)
  recordWorkerPromptDispatch({ taskId, agent, dispatched: delivery })
  effects.push(buildDispatchInputEffect(terminalHandle, delivery.submit))
  return delivery
}

// The dispatch_input stage of worker-start: wait for the agent's composer, build the preamble,
// write it, and record what happened.
//
// Lifted out of orchestration-workers.ts because that file sits at the max-lines cap and this is
// the one stage with its own ordering rule — the composer wait has to sit between readiness and
// the write, and a reader who does not see the three steps together will move it.

import { buildDispatchPreamble } from '../../orchestration/preamble'
import { buildDispatchInputEffect } from './orchestration-dispatch-input-effect'
import {
  awaitWorkerComposer,
  recordWorkerPromptDispatch
} from './orchestration-worker-prompt-diagnostics'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { AgentPromptSubmitOutcome } from '../../../../shared/runtime-types'
import type { OrchestrationCliCommand } from '../../../../main/runtime/orchestration/cli-command'

type DispatchInputRuntime = {
  waitForAgentComposerReady: (handle: string, agent: TuiAgent) => Promise<boolean>
  getNestedWorkerMaxDepth: () => number
  getTerminalOrchestrationCliCommand: (handle: string) => OrchestrationCliCommand | undefined
  sendTerminalAgentPrompt: (
    handle: string,
    prompt: string
  ) => Promise<{ bytesWritten: number; submit?: AgentPromptSubmitOutcome }>
}

export async function deliverWorkerDispatchInput(
  runtime: DispatchInputRuntime,
  args: {
    taskId: string
    taskSpec: string
    dispatchId: string
    dispatchDepth: number
    terminalHandle: string
    capability: string
    coordinatorHandle: string
    devMode: boolean | undefined
    agent: TuiAgent | null | undefined
    effects: unknown[]
  }
): Promise<void> {
  // Why after tui-idle and not instead of it: tui-idle proves an agent owns the pane, but for a
  // pane whose title Orca cannot parse yet it can settle on a generic ready prompt — before the
  // agent's composer exists. A paste written into that window is dropped when the TUI drains
  // stdin at init, and the worker sits with an empty composer. No-op for agents with no signal.
  if (args.agent) {
    await awaitWorkerComposer(runtime, {
      taskId: args.taskId,
      agent: args.agent,
      handle: args.terminalHandle
    })
  }
  const preamble = buildDispatchPreamble({
    canDispatchSubWorkers: args.dispatchDepth < runtime.getNestedWorkerMaxDepth(),
    taskId: args.taskId,
    dispatchId: args.dispatchId,
    taskSpec: args.taskSpec,
    coordinatorHandle: args.coordinatorHandle,
    workerHandle: args.terminalHandle,
    dispatchCapability: args.capability,
    devMode: args.devMode,
    cliCommand: runtime.getTerminalOrchestrationCliCommand(args.terminalHandle)
  })
  const dispatched = await runtime.sendTerminalAgentPrompt(args.terminalHandle, preamble)
  recordWorkerPromptDispatch({ taskId: args.taskId, agent: args.agent, dispatched })
  args.effects.push(buildDispatchInputEffect(args.terminalHandle, dispatched.submit))
}

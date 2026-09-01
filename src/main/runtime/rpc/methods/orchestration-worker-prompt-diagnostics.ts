// One `ORCA-DIAG` line per decision in the worker-start prompt handoff.
//
// Why this path specifically: when a dispatched prompt does not reach a worker there is nothing
// on disk to say which of the four steps lost it — readiness settled on the wrong evidence, the
// composer had not painted, the paste went out but Enter did not, or the submit could not be
// verified. Each step below answers exactly one of those, and the agent + task are on every line
// so a claude worker and an opencode worker in the same run can be told apart.
//
// Off unless the user turns the troubleshooting log on, and it never leaves the machine.

import { writeDiagnosticLine } from '../../../observability/diagnostic-log'
import { isOpenCodeNativeTitle } from '../../../../shared/opencode-terminal-title'
import type { TuiAgent } from '../../../../shared/tui-agent'

/** Titles are user-visible pane labels; cap them so one record stays one short line. */
const MAX_TITLE_CHARS = 48

function titleToken(title: string | null | undefined): string {
  const trimmed = title?.trim()
  if (!trimmed) {
    return 'none'
  }
  return trimmed.length > MAX_TITLE_CHARS ? `${trimmed.slice(0, MAX_TITLE_CHARS)}...` : trimmed
}

/**
 * What `tui-idle` settled on. `ocTitle=no` on an opencode worker is the tell that readiness came
 * from a generic ready-prompt preview rather than opencode's own title — the window in which a
 * paste is written before the composer exists.
 */
export async function recordWorkerPromptReadiness(
  runtime: { showTerminal: (handle: string) => Promise<{ title?: string | null }> },
  args: {
    taskId: string
    agent: TuiAgent | null | undefined
    handle: string
    wait: { satisfied: boolean; status: string; blockedReason?: string | null }
  }
): Promise<void> {
  // Why tolerated: this record must never be the reason a dispatch fails.
  const title = (await runtime.showTerminal(args.handle).catch(() => null))?.title
  writeDiagnosticLine('worker-prompt-ready', {
    task: args.taskId,
    agent: args.agent ?? 'none',
    satisfied: args.wait.satisfied,
    status: args.wait.status,
    blocked: args.wait.blockedReason ?? 'none',
    ocTitle: args.agent === 'opencode' ? isOpenCodeNativeTitle(title) : 'n/a',
    title: titleToken(title)
  })
}

/** Whether the agent's composer signal arrived before the prompt was written, and how long it took. */
export function recordWorkerPromptComposer(args: {
  taskId: string
  agent: TuiAgent
  ready: boolean
  elapsedMs: number
}): void {
  writeDiagnosticLine('worker-prompt-composer', {
    task: args.taskId,
    agent: args.agent,
    ready: args.ready,
    ms: args.elapsedMs
  })
}

/**
 * The composer wait and its record, together — the elapsed time is only meaningful next to the
 * call it measures, and keeping the pair here leaves worker-start reading as one step per line.
 */
export async function awaitWorkerComposer(
  runtime: { waitForAgentComposerReady: (handle: string, agent: TuiAgent) => Promise<boolean> },
  args: { taskId: string; agent: TuiAgent; handle: string }
): Promise<void> {
  const startedAt = Date.now()
  const ready = await runtime.waitForAgentComposerReady(args.handle, args.agent)
  recordWorkerPromptComposer({
    taskId: args.taskId,
    agent: args.agent,
    ready,
    elapsedMs: Date.now() - startedAt
  })
}

/** How the write itself ended. `submit=unverified` means the bytes went out unconfirmed. */
export function recordWorkerPromptDispatch(args: {
  taskId: string
  agent: TuiAgent | null | undefined
  dispatched: { bytesWritten: number; submit?: string | undefined }
}): void {
  writeDiagnosticLine('worker-prompt-sent', {
    task: args.taskId,
    agent: args.agent ?? 'none',
    bytes: args.dispatched.bytesWritten,
    submit: args.dispatched.submit ?? 'unknown'
  })
}

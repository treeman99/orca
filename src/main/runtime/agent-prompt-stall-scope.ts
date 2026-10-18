// Fork-owned: carries upstream's stall verdict out of a prompt write to the fork's Enter rescue,
// which wraps upstream's send instead of editing it (orca-runtime-agent-prompt-rescue.ts).
import { AsyncLocalStorage } from 'node:async_hooks'

const stallScope = new AsyncLocalStorage<{ stalled: boolean }>()

export async function captureAgentPromptStall<T>(
  send: () => Promise<T>
): Promise<{ result: T; stalled: boolean }> {
  const verdict = { stalled: false }
  const result = await stallScope.run(verdict, send)
  return { result, stalled: verdict.stalled }
}

/** Marks the enclosing capture when a write reports `stalled` (terminal-agent-prompt.ts). */
export function recordAgentPromptStall(delivery: unknown): void {
  const verdict = stallScope.getStore()
  if (
    verdict &&
    typeof delivery === 'object' &&
    delivery !== null &&
    'stalled' in delivery &&
    delivery.stalled === true
  ) {
    verdict.stalled = true
  }
}

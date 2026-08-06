import type { AgentPromptSubmitOutcome } from '../../../../shared/runtime-types'

export type DispatchInputEffect = {
  kind: 'dispatch_input'
  role: string
  id: string
  state: string
  warning?: string
}

/**
 * Why: an unconfirmed submit still records `accepted` — the bytes really did go
 * out — so without this the receipt is indistinguishable from a delivered
 * dispatch, and a worker holding the prompt in its composer stays unnoticed
 * until someone opens the terminal and presses Enter by hand.
 */
export function buildDispatchInputEffect(
  terminalHandle: string,
  submit: AgentPromptSubmitOutcome | undefined
): DispatchInputEffect {
  return {
    kind: 'dispatch_input',
    role: 'agent',
    id: terminalHandle,
    state: 'accepted',
    ...(submit === 'unverified'
      ? {
          warning:
            'Prompt was written but its submission could not be confirmed. Read the worker terminal before treating the task as started.'
        }
      : {})
  }
}

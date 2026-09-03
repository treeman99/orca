import type { RuntimeTerminalAgentStatus } from '../../shared/runtime-types'
import type { TuiAgent } from '../../shared/tui-agent'

export type AgentPromptSubmitVerdict = 'submitted' | 'unsubmitted' | 'blocked' | 'indeterminate'

/**
 * Decides whether a swallowed Enter may be resent. Only `unsubmitted` fires,
 * and it needs two positive facts at once: an agent owns the terminal, and it
 * reports idle after the submit settled — a prompt that actually went through
 * leaves the agent working. Everything else is refused, because the cost of a
 * wrong Enter (silently approving a permission or selection prompt) is far
 * higher than the cost of a prompt the user has to submit by hand.
 */
export function classifyAgentPromptSubmitEvidence(
  status: Pick<RuntimeTerminalAgentStatus, 'isRunningAgent' | 'status'>
): AgentPromptSubmitVerdict {
  // Why first: `getTerminalAgentStatus` folds both permission titles and
  // on-screen blocked prompts (trust dialogs, "press enter to continue") into
  // this one state, so this single check covers every known dialog surface.
  if (status.status === 'permission') {
    return 'blocked'
  }
  if (status.status === 'working') {
    return 'submitted'
  }
  // Why: `null` means no agent evidence at all — a plain shell, or a TUI whose
  // state Orca cannot read. Neither is proof the prompt is still pending.
  if (!status.isRunningAgent || status.status !== 'idle') {
    return 'indeterminate'
  }
  return 'unsubmitted'
}

/**
 * Upstream reports a stalled submit by throwing; this fork first lets the rescue try one Enter.
 * Only a rescue that resent keeps the send successful — `unverified` means nothing was done about
 * the stall, so the caller must still hear about it under upstream's own error name.
 */
export function assertAgentPromptRescuedIfStalled(
  stalled: boolean,
  submit: 'verified' | 'unverified' | 'resent',
  statusObserved = true
): void {
  // Why `statusObserved`: the verifier proves delivery from a status edge, a hook turn start, or
  // output after Enter on an already-working pane. An agent with no managed hook whose title Orca
  // never parses — opencode under ConPTY, which swallows the OSC title — can produce none of the
  // three, so every one of its dispatches stalled and failed worker-start outright (regression
  // since v1.4.188). Absence of evidence is not evidence of failure; this is the same rule the
  // SSH boundary uses for a host that stopped answering. Nothing is loosened for a pane Orca can
  // read, the rescue still refuses to resend Enter on an indeterminate verdict, and the receipt
  // still carries the `unverified` warning so a swallowed prompt stays visible.
  if (stalled && submit === 'unverified' && statusObserved) {
    throw new Error('agent_prompt_stalled')
  }
}

export function isTerminalSendSettlementAgent(
  agent: TuiAgent | null | undefined
): agent is 'claude' | 'codex' {
  // Why opencode is NOT here even though its composer marker would fit the gate: it never
  // reaches one. `sendTerminalAgentPrompt` hands a `promptDeliveryMode: 'plain-text'` agent to
  // the plain send path before the gate is built, because opencode does not read a paste frame
  // at all under ConPTY. Listing it would be a protection that cannot run.
  return agent === 'claude' || agent === 'codex'
}

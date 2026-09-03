import { TUI_AGENT_CONFIG } from '../../shared/tui-agent-config'
import type { RuntimeTerminalSend } from '../../shared/runtime-types'
import type { TuiAgent } from '../../shared/tui-agent'
import {
  AGENT_PROMPT_PASTE_QUIET_MS,
  AGENT_PROMPT_PASTE_SETTLE_TIMEOUT_MS,
  AGENT_PROMPT_SUBMIT,
  AGENT_PROMPT_SUBMIT_DELAY_MS,
  AGENT_PROMPT_SUBMIT_VERIFY_ATTEMPTS,
  AGENT_PROMPT_SUBMIT_VERIFY_FLOOR_MS,
  sanitizeAgentPromptText
} from '../../shared/agent-prompt-injection'
import { writeDiagnosticLine } from '../observability/diagnostic-log'
import type { AgentPromptActivity } from './agent-prompt-submission-verification'
import {
  classifyAgentPromptSubmitEvidence,
  type AgentPromptSubmitVerdict
} from './agent-prompt-submit-evidence'
import { OrcaRuntimeWithSerializeAgentPromptSubmission } from './orca-runtime-serialize-agent-prompt-submission'

export type AgentPromptSubmitOutcome = 'verified' | 'unverified' | 'resent'

/**
 * Members this layer needs that the split chain defines below it. Upstream's mechanically
 * split layers reach them through a file-wide `@ts-nocheck`; the ratchet forbids adding one,
 * so name exactly what is used instead — a lost member then fails typecheck here.
 */
type AgentPromptRescueForwardRefs = {
  getLivePtyForHandle(handle: string): { pty: { ptyId: string } } | null
  getLiveLeafForHandle(handle: string): { leaf: { ptyId?: string | null } }
  getPtyAgent(ptyId: string): TuiAgent | null
}

/**
 * The fork's Enter-rescue for a swallowed agent prompt, plus the plain-text delivery lane
 * for agents that cannot read a bracketed paste frame under ConPTY.
 */
export class OrcaRuntimeWithAgentPromptRescue extends OrcaRuntimeWithSerializeAgentPromptSubmission {
  private get forward(): AgentPromptRescueForwardRefs {
    return this as unknown as AgentPromptRescueForwardRefs
  }

  // Why here and not at the callers: every Orca-written prompt reaches a pane through
  // sendTerminalAgentPrompt — worker dispatch, coordinator follow-ups, `terminal send
  // --agent-prompt` — and an agent that cannot read a paste frame cannot read one from any.
  protected usesPlainTextPromptDelivery(handle: string): boolean {
    const ptyId = this.forward.getLivePtyForHandle(handle)?.pty.ptyId ?? this.tryGetLeafPtyId(handle)
    const agent = ptyId ? this.forward.getPtyAgent(ptyId) : null
    return agent !== null && TUI_AGENT_CONFIG[agent].promptDeliveryMode === 'plain-text'
  }

  protected sendPlainTextAgentPrompt(
    handle: string,
    prompt: string,
    options: Parameters<this['sendTerminal']>[2]
  ): Promise<RuntimeTerminalSend> {
    // Why sanitized here too: dropping the paste frame must not also drop the escape
    // neutralization it carried — a prompt with a raw ESC would otherwise drive the terminal.
    return this.sendTerminal(handle, { text: sanitizeAgentPromptText(prompt), enter: true }, options)
  }

  protected tryGetLeafPtyId(handle: string): string | null {
    try {
      return this.forward.getLiveLeafForHandle(handle).leaf.ptyId ?? null
    } catch {
      return null
    }
  }

  protected async waitForTerminalOutputSettled(
    ptyId: string,
    floorMs = AGENT_PROMPT_SUBMIT_DELAY_MS
  ): Promise<void> {
    const watch = this.watchTerminalOutput(ptyId)
    try {
      await watch.settled(floorMs)
    } finally {
      watch.dispose()
    }
  }

  /**
   * Counts render output from the moment it is armed so a caller can wait for
   * evidence that the TUI consumed what was just written. `requireOutput` holds
   * until at least one frame lands after arming; without it, quiet alone
   * settles the wait — the right rule for a payload the target may not echo.
   */
  protected watchTerminalOutput(ptyId: string): {
    settled: (floorMs?: number, options?: { requireOutput?: boolean }) => Promise<void>
    dispose: () => void
  } {
    let outputCount = 0
    const observers = new Set<() => void>()
    const unsubscribe = this.subscribeToTerminalData(ptyId, () => {
      outputCount += 1
      for (const observe of observers) {
        observe()
      }
    })

    return {
      settled: (floorMs = AGENT_PROMPT_SUBMIT_DELAY_MS, options = {}) =>
        new Promise<void>((resolve) => {
          const outputCountAtArm = outputCount
          let settled = false
          let floorElapsed = false
          let quietTimer: NodeJS.Timeout | null = null

          const finish = (): void => {
            if (settled) {
              return
            }
            settled = true
            if (quietTimer) {
              clearTimeout(quietTimer)
            }
            clearTimeout(floorTimer)
            clearTimeout(hardTimer)
            observers.delete(observe)
            resolve()
          }

          const armQuietTimer = (): void => {
            if (settled || (options.requireOutput && outputCount === outputCountAtArm)) {
              return
            }
            if (quietTimer) {
              clearTimeout(quietTimer)
            }
            quietTimer = setTimeout(finish, AGENT_PROMPT_PASTE_QUIET_MS)
          }

          // Why: only rearm once the floor has passed — render output during the
          // floor is expected and must not extend the wait.
          const observe = (): void => {
            if (floorElapsed) {
              armQuietTimer()
            }
          }

          observers.add(observe)
          const floorTimer = setTimeout(() => {
            floorElapsed = true
            armQuietTimer()
          }, floorMs)
          const hardTimer = setTimeout(finish, floorMs + AGENT_PROMPT_PASTE_SETTLE_TIMEOUT_MS)
        }),
      dispose: unsubscribe
    }
  }

  protected async resubmitAgentPromptIfStillUnsubmitted(
    handle: string,
    ptyId: string,
    activityBaseline?: AgentPromptActivity
  ): Promise<{ outcome: AgentPromptSubmitOutcome; statusObserved: boolean }> {
    // Why: the classifier reads a *snapshot* and infers "idle means never submitted", which is
    // wrong for an agent that answered and went idle before the settle wait polled. The lifecycle
    // counter records the working transition even when it is already over, so a prompt that
    // provably reached the agent can never draw the stray Enter this rescue exists to avoid.
    if (
      activityBaseline &&
      this.getAgentPromptActivity(handle, ptyId).workingSequence > activityBaseline.workingSequence
    ) {
      return { outcome: 'verified', statusObserved: true }
    }
    // Why tracked: `status: null` is not "idle", it is "Orca cannot read this pane". An agent with
    // no managed hook whose title Orca never parses can never produce a status, so a stall on it
    // is absence of evidence, not evidence of failure.
    let statusObserved = false
    let verdict: AgentPromptSubmitVerdict = 'indeterminate'
    // Why: a worker dispatched seconds after launch has no status evidence yet,
    // so the first check reads "cannot tell" on precisely the terminals this
    // rescue exists for. Keep re-reading until the evidence arrives; a decided
    // verdict stops the loop immediately.
    for (let attempt = 0; attempt < AGENT_PROMPT_SUBMIT_VERIFY_ATTEMPTS; attempt += 1) {
      try {
        await this.waitForTerminalOutputSettled(ptyId, AGENT_PROMPT_SUBMIT_VERIFY_FLOOR_MS)
        const status = await this.getTerminalAgentStatus(handle)
        statusObserved = statusObserved || status.status !== null
        verdict = classifyAgentPromptSubmitEvidence(status)
      } catch {
        // Why: a terminal that cannot be read is the "cannot tell" case, and
        // cannot-tell must never fire Enter.
        verdict = 'indeterminate'
      }
      if (verdict !== 'indeterminate') {
        break
      }
    }
    // Why the anchor: a hook row that keeps pinging the SAME working turn refreshes updatedAt
    // without starting a new one (#16095), so "status is working" is then evidence of the turn
    // that was already running, not of this prompt landing. Narrow on purpose — it only fires
    // when the baseline itself carried an explicit working row reporting the same turn start.
    if (
      verdict === 'submitted' &&
      activityBaseline?.explicitWorkingStartedAt != null &&
      this.getAgentPromptActivity(handle, ptyId).explicitWorkingStartedAt ===
        activityBaseline.explicitWorkingStartedAt
    ) {
      verdict = 'indeterminate'
    }
    if (verdict === 'submitted') {
      return { outcome: 'verified', statusObserved: true }
    }
    if (verdict !== 'unsubmitted') {
      // Why: silence here would hide both a swallowed prompt and a blocked
      // agent; the dispatch looks delivered either way.
      console.warn(
        `[agent-prompt] ${handle}: submit unverified (${verdict}); statusObserved=${statusObserved}; Enter was NOT resent`
      )
      writeDiagnosticLine('agent-prompt-submit', {
        agent: this.forward.getPtyAgent(ptyId) ?? 'none',
        outcome: 'unverified',
        verdict,
        statusObserved
      })
      return { outcome: 'unverified', statusObserved }
    }
    const resent = this.ptyController?.write(ptyId, AGENT_PROMPT_SUBMIT) ?? false
    console.warn(
      `[agent-prompt] ${handle}: prompt still unsubmitted after Enter; resent once (accepted=${resent})`
    )
    writeDiagnosticLine('agent-prompt-submit', {
      agent: this.forward.getPtyAgent(ptyId) ?? 'none',
      outcome: 'resent',
      verdict,
      accepted: resent
    })
    return { outcome: 'resent', statusObserved: true }
  }
}

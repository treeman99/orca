import type { Automation, AutomationPrecheckResult } from '../../shared/automations-types'
import { runAutomationPrecheck } from './precheck-runner'
import type { AutomationRunTargetResult } from './run-target-resolution'

/**
 * Run an automation's precheck against its resolved target, reporting an unresolvable
 * target as a completed-but-failed precheck rather than throwing.
 *
 * Split out of `AutomationService` for max-lines; it reads no service state.
 */
export async function runAutomationPrecheckForTarget(
  automation: Automation,
  target: AutomationRunTargetResult
): Promise<AutomationPrecheckResult> {
  if (!automation.precheck) {
    throw new Error('Automation has no precheck.')
  }
  if (!target.ok) {
    const now = Date.now()
    return {
      command: automation.precheck.command,
      exitCode: null,
      timedOut: false,
      durationMs: 0,
      stdout: '',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false,
      error: target.error,
      startedAt: now,
      completedAt: now
    }
  }
  return await runAutomationPrecheck({
    precheck: automation.precheck,
    target:
      automation.executionTargetType === 'ssh'
        ? { type: 'ssh', cwd: target.cwd, connectionId: automation.executionTargetId }
        : { type: 'local', cwd: target.cwd }
  })
}

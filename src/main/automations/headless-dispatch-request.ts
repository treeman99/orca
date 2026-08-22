// The headless (`orca serve`, no renderer) half of an automation dispatch.
//
// Extracted from AutomationService so the service file stays inside the 300-line cap after
// the enterprise unattended-run gate landed. Deps are passed explicitly rather than the
// service handing over `this`: the precheck and the completion follow-up are the only two
// service methods this path needs, and naming them keeps that surface from creeping.

import type { Store } from '../persistence'
import type {
  Automation,
  AutomationDispatchResult,
  AutomationPrecheckResult,
  AutomationRun
} from '../../shared/automations-types'
import {
  didAutomationPrecheckPass,
  formatAutomationPrecheckFailure
} from '../../shared/automation-precheck'
import type { HeadlessAutomationDispatcher } from './headless-dispatch'
import type { AutomationRunTargetResult } from './run-target-resolution'

export type HeadlessDispatchRequestDeps = {
  store: Store
  dispatcher: HeadlessAutomationDispatcher
  runPrecheck: (automationId: string, runId: string) => Promise<AutomationPrecheckResult | null>
  markDispatchResult: (result: AutomationDispatchResult) => Promise<AutomationRun>
}

export async function requestHeadlessAutomationDispatch(
  deps: HeadlessDispatchRequestDeps,
  input: {
    automation: Automation
    run: AutomationRun
    target: Extract<AutomationRunTargetResult, { ok: true }>
  }
): Promise<AutomationRun> {
  const { automation, run, target } = input
  const precheckResult =
    run.trigger === 'scheduled' && automation.precheck
      ? await deps.runPrecheck(automation.id, run.id)
      : null
  if (precheckResult && !didAutomationPrecheckPass(precheckResult)) {
    return deps.store.updateAutomationRun({
      runId: run.id,
      status: 'skipped_precheck',
      workspaceId: automation.workspaceId,
      precheckResult,
      error: formatAutomationPrecheckFailure(precheckResult)
    })
  }
  try {
    const launch = await deps.dispatcher({ automation, run, target })
    const launchRunTarget = {
      workspaceId: launch.workspaceId,
      workspaceDisplayName: launch.workspaceDisplayName ?? null,
      terminalSessionId: launch.terminalSessionId,
      terminalPaneKey: launch.terminalPaneKey ?? null,
      terminalPtyId: launch.terminalPtyId ?? null
    }
    const updated = deps.store.updateAutomationRun({
      runId: run.id,
      status: 'dispatched',
      ...launchRunTarget,
      error: null
    })
    if (launch.completion) {
      void launch.completion
        .then((completion) =>
          deps.markDispatchResult({
            runId: run.id,
            status: completion.status,
            ...launchRunTarget,
            precheckResult,
            outputSnapshot: completion.outputSnapshot ?? null,
            error: completion.error ?? null
          })
        )
        .catch((error) =>
          deps.markDispatchResult({
            runId: run.id,
            status: 'dispatch_failed',
            ...launchRunTarget,
            error: error instanceof Error ? error.message : String(error)
          })
        )
    }
    return updated
  } catch (error) {
    return deps.store.updateAutomationRun({
      runId: run.id,
      status: 'dispatch_failed',
      workspaceId: automation.workspaceId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

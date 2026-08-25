import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ORCHESTRATION_WORKER_PANE_MAX_GROUPS,
  ORCHESTRATION_WORKER_PANE_MAX_GROUP_CHOICES,
  resolveOrchestrationWorkerPaneMaxGroups
} from './terminal-pane-placement'

describe('resolveOrchestrationWorkerPaneMaxGroups', () => {
  it('falls back to the default for settings written before the choice existed', () => {
    expect(resolveOrchestrationWorkerPaneMaxGroups(undefined)).toBe(
      DEFAULT_ORCHESTRATION_WORKER_PANE_MAX_GROUPS
    )
  })

  it('keeps every offered choice verbatim', () => {
    for (const choice of ORCHESTRATION_WORKER_PANE_MAX_GROUP_CHOICES) {
      expect(resolveOrchestrationWorkerPaneMaxGroups(choice)).toBe(choice)
    }
  })

  it('clamps a hand-edited value into range instead of stranding the column', () => {
    expect(resolveOrchestrationWorkerPaneMaxGroups(0)).toBe(1)
    expect(resolveOrchestrationWorkerPaneMaxGroups(-4)).toBe(1)
    expect(resolveOrchestrationWorkerPaneMaxGroups(1e9)).toBe(6)
  })

  it('rejects the non-numeric shapes a settings file can actually hold', () => {
    for (const value of [Number.NaN, Infinity, null, '4']) {
      expect(resolveOrchestrationWorkerPaneMaxGroups(value as unknown as number)).toBe(
        DEFAULT_ORCHESTRATION_WORKER_PANE_MAX_GROUPS
      )
    }
  })

  it('rounds a fractional value onto a real pane count', () => {
    expect(resolveOrchestrationWorkerPaneMaxGroups(2.4)).toBe(2)
    expect(resolveOrchestrationWorkerPaneMaxGroups(2.6)).toBe(3)
  })
})

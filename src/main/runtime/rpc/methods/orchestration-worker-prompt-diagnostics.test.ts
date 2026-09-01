import { beforeEach, describe, expect, it, vi } from 'vitest'

const write = vi.hoisted(() => vi.fn())
vi.mock('../../../observability/diagnostic-log', () => ({ writeDiagnosticLine: write }))

import {
  recordWorkerPromptComposer,
  recordWorkerPromptDispatch,
  recordWorkerPromptReadiness
} from './orchestration-worker-prompt-diagnostics'

function runtimeWithTitle(title: string | null) {
  return { showTerminal: async () => ({ title }) }
}

describe('worker prompt diagnostics', () => {
  beforeEach(() => write.mockReset())

  // The tell this whole record exists for: readiness settled without opencode's own title, which
  // is the window where a paste lands before the composer and is dropped.
  it('marks an opencode pane that became ready on someone else’s title', async () => {
    await recordWorkerPromptReadiness(runtimeWithTitle('worker-task-alpha'), {
      taskId: 'task_1',
      agent: 'opencode',
      handle: 'term_1',
      wait: { satisfied: true, status: 'idle' }
    })

    expect(write).toHaveBeenCalledWith(
      'worker-prompt-ready',
      expect.objectContaining({ agent: 'opencode', ocTitle: false, title: 'worker-task-alpha' })
    )
  })

  it('marks the same pane once opencode owns the title', async () => {
    await recordWorkerPromptReadiness(runtimeWithTitle('OC |  building the thing'), {
      taskId: 'task_1',
      agent: 'opencode',
      handle: 'term_1',
      wait: { satisfied: true, status: 'idle' }
    })

    expect(write).toHaveBeenCalledWith(
      'worker-prompt-ready',
      expect.objectContaining({ ocTitle: true })
    )
  })

  // Why `n/a` and not `false`: the question is meaningless for an agent whose readiness never
  // consults an opencode title, and a bare `false` there reads as a fault.
  it('does not ask the opencode question of another agent', async () => {
    await recordWorkerPromptReadiness(runtimeWithTitle('✳ Claude Code'), {
      taskId: 'task_1',
      agent: 'claude',
      handle: 'term_1',
      wait: { satisfied: true, status: 'idle' }
    })

    expect(write).toHaveBeenCalledWith(
      'worker-prompt-ready',
      expect.objectContaining({ agent: 'claude', ocTitle: 'n/a' })
    )
  })

  it('keeps a long title to one line', async () => {
    await recordWorkerPromptReadiness(runtimeWithTitle('x'.repeat(200)), {
      taskId: 'task_1',
      agent: 'opencode',
      handle: 'term_1',
      wait: { satisfied: false, status: 'timeout' }
    })

    const title = String(write.mock.calls[0]?.[1]?.title)
    expect(title.length).toBeLessThanOrEqual(51)
    expect(title.endsWith('...')).toBe(true)
  })

  it('records the composer wait and how the write ended', () => {
    recordWorkerPromptComposer({ taskId: 'task_1', agent: 'opencode', ready: false, elapsedMs: 8000 })
    recordWorkerPromptDispatch({
      taskId: 'task_1',
      agent: 'opencode',
      dispatched: { bytesWritten: 4096, submit: 'unverified' }
    })

    expect(write).toHaveBeenCalledWith(
      'worker-prompt-composer',
      expect.objectContaining({ ready: false, ms: 8000 })
    )
    expect(write).toHaveBeenCalledWith(
      'worker-prompt-sent',
      expect.objectContaining({ bytes: 4096, submit: 'unverified' })
    )
  })
})

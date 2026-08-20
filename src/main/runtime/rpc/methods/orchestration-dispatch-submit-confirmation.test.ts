// Fork-owned. Why: the reported failure is silent — the prompt is written, the receipt says
// `accepted`, and the worker sits with the text in its composer until a human notices. An
// unconfirmed submit has to travel with the receipt so the coordinator can look instead of
// assuming the task started. Kept in its own file so an upstream split of the orchestration
// suite cannot carry it away.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcContext } from '../core'
import { createOrchestrationRpcHarness } from './orchestration-rpc-test-harness'
import type { OrchestrationDb } from '../../orchestration/db'
import type { OrcaRuntimeService } from '../../orca-runtime'

describe('orchestration worker dispatch submit confirmation', () => {
  const h = createOrchestrationRpcHarness()
  const { coordinatorPaneKey } = h
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService
  let ctx: RpcContext

  function setup(): void {
    ;({ db, runtime, ctx } = h.setup(true))
  }

  afterEach(() => {
    h.cleanup()
  })

  async function call(name: string, params: Record<string, unknown>) {
    return h.call(name, params, ctx)
  }

  function mockCurrentWorkerStart(): void {
    vi.mocked(runtime.getTerminalPaneKey).mockImplementation((handle) =>
      handle === 'term_coord'
        ? coordinatorPaneKey
        : handle === 'term_worker'
          ? 'tab_worker:leaf_worker'
          : null
    )
    vi.spyOn(runtime, 'validateOrchestrationAgentLauncher').mockImplementation(() => {})
    vi.spyOn(runtime, 'showTerminal').mockImplementation(
      async (handle) => ({ handle, worktreeId: 'repo::worktree', status: 'running' }) as never
    )
    vi.spyOn(runtime, 'showManagedWorktree').mockResolvedValue({ id: 'repo::worktree' } as never)
    vi.spyOn(runtime, 'showManagedTerminalWorkspace').mockResolvedValue({
      id: 'repo::worktree'
    } as never)
    vi.spyOn(runtime, 'createTerminal').mockResolvedValue({
      handle: 'term_worker',
      worktreeId: 'repo::worktree',
      title: 'worker'
    })
    vi.spyOn(runtime, 'waitForTerminal').mockResolvedValue({
      handle: 'term_worker',
      condition: 'tui-idle',
      satisfied: true,
      status: 'running',
      exitCode: null
    })
    vi.mocked(runtime.getTerminalProcessIncarnation).mockImplementation((handle) =>
      handle === 'term_worker' ? 'runtime_test:term_worker:1' : null
    )
    vi.spyOn(runtime, 'getTerminalOrchestrationCliCommand').mockReturnValue('orca')
  }

  it('carries an unconfirmed prompt submit into the dispatch receipt', async () => {
    setup()
    mockCurrentWorkerStart()
    vi.spyOn(runtime, 'sendTerminalAgentPrompt').mockResolvedValue({
      handle: 'term_worker',
      accepted: true,
      bytesWritten: 1,
      submit: 'unverified'
    })
    const task = db.createTask({ spec: 'implement worker start' })

    const result = (await call('orchestration.workerStart', {
      task: task.id,
      from: 'term_coord',
      agent: 'codex'
    })) as { effects: { kind: string; state?: string; warning?: string }[] }

    expect(result.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'dispatch_input',
          state: 'accepted',
          warning: expect.stringContaining('could not be confirmed')
        })
      ])
    )
  })

  it('leaves the dispatch receipt unqualified when the submit is confirmed', async () => {
    setup()
    mockCurrentWorkerStart()
    vi.spyOn(runtime, 'sendTerminalAgentPrompt').mockResolvedValue({
      handle: 'term_worker',
      accepted: true,
      bytesWritten: 1,
      submit: 'verified'
    })
    const task = db.createTask({ spec: 'implement worker start' })

    const result = (await call('orchestration.workerStart', {
      task: task.id,
      from: 'term_coord',
      agent: 'codex'
    })) as { effects: { kind: string; warning?: string }[] }

    expect(
      result.effects.find((effect) => effect.kind === 'dispatch_input')?.warning
    ).toBeUndefined()
  })
})

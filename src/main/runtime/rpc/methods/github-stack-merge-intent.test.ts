// Fork gate: github.mergePR must never synthesize a stack-merge opt-in the client did not send.
// Split out of github.test.ts because that file sits at the max-lines cap.
import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { GITHUB_METHODS } from './github'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

describe('github.mergePR stack-merge intent', () => {
  // Mobile and every pre-gate client omit stackMergeIntent. The handler must carry that absence
  // through untouched so mergePR fails a stacked PR closed instead of merging the whole stack.
  it('never invents a stack-merge opt-in for a request that omits one', async () => {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      mergeRepoPR: vi.fn().mockResolvedValue({ ok: false, error: 'blocked' })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: GITHUB_METHODS })

    await dispatcher.dispatch(makeRequest('github.mergePR', { repo: 'repo-1', prNumber: 7 }))

    expect(runtime.mergeRepoPR).toHaveBeenCalledWith('repo-1', 7, undefined, null, undefined)
  })

  it('forwards a confirmed stack scope from a client that showed it', async () => {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      mergeRepoPR: vi.fn().mockResolvedValue({ ok: true })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: GITHUB_METHODS })

    await dispatcher.dispatch(
      makeRequest('github.mergePR', {
        repo: 'repo-1',
        prNumber: 7,
        method: 'squash',
        stackMergeIntent: 'confirmed-stack-scope'
      })
    )

    expect(runtime.mergeRepoPR).toHaveBeenCalledWith(
      'repo-1',
      7,
      'squash',
      null,
      'confirmed-stack-scope'
    )
  })

  it('rejects a stack-merge opt-in it does not recognize', async () => {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      mergeRepoPR: vi.fn().mockResolvedValue({ ok: true })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: GITHUB_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('github.mergePR', {
        repo: 'repo-1',
        prNumber: 7,
        stackMergeIntent: 'yes-please'
      })
    )

    expect(response).toMatchObject({ ok: false })
    expect(runtime.mergeRepoPR).not.toHaveBeenCalled()
  })
})

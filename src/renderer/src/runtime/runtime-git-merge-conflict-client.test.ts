import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitMergeConflictInputs } from '../../../shared/git-merge-conflict-inputs'
import { getRuntimeGitMergeConflictInputs } from './runtime-git-merge-conflict-client'
import { callRuntimeRpc } from './runtime-rpc-client'
import { RuntimeRpcCallError } from './runtime-rpc-result'

vi.mock('./runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))

const mergeConflictInputs = vi.fn()
const host = { kind: 'environment' as const, environmentId: 'server-a' }
const inputs: GitMergeConflictInputs = {
  base: { content: 'a\n', exists: true, isBinary: false },
  ours: { content: 'b\n', exists: true, isBinary: false },
  theirs: { content: 'c\n', exists: true, isBinary: false },
  operation: 'merge'
}

function rpcRefusal(code: string): RuntimeRpcCallError {
  return new RuntimeRpcCallError({
    id: 'req-1',
    ok: false,
    error: { code, message: code },
    _meta: { runtimeId: 'server-a' }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { api: { git: { mergeConflictInputs } } })
})

describe('getRuntimeGitMergeConflictInputs', () => {
  it('reads a local worktree through the preload IPC bridge', async () => {
    mergeConflictInputs.mockResolvedValue(inputs)

    await expect(
      getRuntimeGitMergeConflictInputs(
        { target: { kind: 'local' }, worktreeId: 'wt-1', worktreePath: '/repo', connectionId: 'c' },
        'src/a.ts'
      )
    ).resolves.toBe(inputs)
    expect(mergeConflictInputs).toHaveBeenCalledWith({
      worktreePath: '/repo',
      filePath: 'src/a.ts',
      connectionId: 'c'
    })
    expect(callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('sends a remote worktree to its runtime host', async () => {
    vi.mocked(callRuntimeRpc).mockResolvedValue(inputs)

    await expect(
      getRuntimeGitMergeConflictInputs(
        { target: host, worktreeId: 'wt-1', worktreePath: '/repo' },
        'src/a.ts'
      )
    ).resolves.toBe(inputs)
    expect(callRuntimeRpc).toHaveBeenCalledWith(
      host,
      'git.mergeConflictInputs',
      { worktree: 'id:wt-1', filePath: 'src/a.ts' },
      { timeoutMs: 15_000 }
    )
    expect(mergeConflictInputs).not.toHaveBeenCalled()
  })

  it('reads method_not_found from an older host as "rebuild from markers"', async () => {
    vi.mocked(callRuntimeRpc).mockRejectedValue(rpcRefusal('method_not_found'))

    await expect(
      getRuntimeGitMergeConflictInputs(
        { target: host, worktreeId: 'wt-1', worktreePath: '/repo' },
        'a.ts'
      )
    ).resolves.toBeNull()
  })

  it('reads the web bridge’s coded method_not_found the same way', async () => {
    mergeConflictInputs.mockRejectedValue(
      Object.assign(new Error('Unknown method'), { code: 'method_not_found' })
    )

    await expect(
      getRuntimeGitMergeConflictInputs(
        { target: { kind: 'local' }, worktreeId: 'wt-1', worktreePath: '/repo' },
        'a.ts'
      )
    ).resolves.toBeNull()
  })

  it('passes every other failure through', async () => {
    vi.mocked(callRuntimeRpc).mockRejectedValue(rpcRefusal('forbidden'))

    await expect(
      getRuntimeGitMergeConflictInputs(
        { target: host, worktreeId: 'wt-1', worktreePath: '/repo' },
        'a.ts'
      )
    ).rejects.toMatchObject({ code: 'forbidden' })
  })
})

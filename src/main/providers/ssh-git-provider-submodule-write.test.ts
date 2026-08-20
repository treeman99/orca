/**
 * The SSH half of the old-host degrade contract for submodule writes.
 *
 * A relay that predates these methods answers -32601. Left raw, Source Control would show a
 * JSON-RPC error — or, for a write, look like it had nothing to say. Each method rethrows one
 * shared marker message the renderer classifies (see git-submodule-write-support.ts).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SUBMODULE_WRITE_UNSUPPORTED_MESSAGE } from '../../shared/git-submodule-write-support'
import { SshGitProvider } from './ssh-git-provider'

function methodNotFound(method: string): Error {
  const error = new Error(`Method not found: ${method}`) as Error & { code?: number }
  error.code = -32601
  return error
}

describe('SshGitProvider submodule write operations', () => {
  let mux: { request: ReturnType<typeof vi.fn>; onDispose: ReturnType<typeof vi.fn> }
  let provider: SshGitProvider

  beforeEach(() => {
    mux = { request: vi.fn().mockResolvedValue(undefined), onDispose: vi.fn(() => vi.fn()) }
    provider = new SshGitProvider('conn-1', mux as never)
  })

  it('sends one RPC per operation with the submodule-relative paths', async () => {
    mux.request.mockResolvedValue({ submodules: [], didHitLimit: false })
    await provider.listSubmodules('/home/user/repo')
    expect(mux.request).toHaveBeenCalledWith('git.submoduleList', {
      worktreePath: '/home/user/repo'
    })

    mux.request.mockResolvedValue(undefined)
    await provider.stageSubmoduleFiles('/home/user/repo', 'vendor/lib', ['a.txt'])
    expect(mux.request).toHaveBeenCalledWith('git.submoduleStage', {
      worktreePath: '/home/user/repo',
      submodulePath: 'vendor/lib',
      filePaths: ['a.txt']
    })

    await provider.unstageSubmoduleFiles('/home/user/repo', 'vendor/lib', ['a.txt'])
    expect(mux.request).toHaveBeenCalledWith('git.submoduleUnstage', {
      worktreePath: '/home/user/repo',
      submodulePath: 'vendor/lib',
      filePaths: ['a.txt']
    })

    mux.request.mockResolvedValue({ success: true })
    await provider.commitSubmodule('/home/user/repo', 'vendor/lib', 'msg')
    expect(mux.request).toHaveBeenCalledWith('git.submoduleCommit', {
      worktreePath: '/home/user/repo',
      submodulePath: 'vendor/lib',
      message: 'msg'
    })

    mux.request.mockResolvedValue(undefined)
    await provider.pushSubmodule('/home/user/repo', 'vendor/lib', true)
    expect(mux.request).toHaveBeenCalledWith('git.submodulePush', {
      worktreePath: '/home/user/repo',
      submodulePath: 'vendor/lib',
      publish: true
    })

    await provider.pullSubmodule('/home/user/repo', 'vendor/lib')
    expect(mux.request).toHaveBeenCalledWith('git.submodulePull', {
      worktreePath: '/home/user/repo',
      submodulePath: 'vendor/lib'
    })
  })

  it('omits publish when the caller did not choose one', async () => {
    await provider.pushSubmodule('/home/user/repo', 'vendor/lib')

    expect(mux.request).toHaveBeenCalledWith('git.submodulePush', {
      worktreePath: '/home/user/repo',
      submodulePath: 'vendor/lib'
    })
  })

  it.each([
    ['git.submoduleList', () => provider.listSubmodules('/repo')],
    ['git.submoduleStage', () => provider.stageSubmoduleFiles('/repo', 'vendor/lib', ['a.txt'])],
    [
      'git.submoduleUnstage',
      () => provider.unstageSubmoduleFiles('/repo', 'vendor/lib', ['a.txt'])
    ],
    ['git.submoduleCommit', () => provider.commitSubmodule('/repo', 'vendor/lib', 'msg')],
    ['git.submodulePush', () => provider.pushSubmodule('/repo', 'vendor/lib')],
    ['git.submodulePull', () => provider.pullSubmodule('/repo', 'vendor/lib')]
  ])('%s degrades explicitly on an old relay', async (method, call) => {
    mux.request.mockRejectedValueOnce(methodNotFound(method))

    await expect(call()).rejects.toThrow(SUBMODULE_WRITE_UNSUPPORTED_MESSAGE)
  })

  // Why: a real remote failure reported as "unsupported" would hide a failed write.
  it('rethrows non-method-not-found errors unchanged', async () => {
    mux.request.mockRejectedValueOnce(new Error('fatal: index.lock exists'))

    await expect(provider.stageSubmoduleFiles('/repo', 'vendor/lib', ['a.txt'])).rejects.toThrow(
      'fatal: index.lock exists'
    )
  })
})

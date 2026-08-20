// @vitest-environment happy-dom
/**
 * Sync Changes on a submodule section must be pull THEN push.
 *
 * Why this suite exists: the first version routed both `publish` and `sync` to the push
 * call. A behind-only submodule then got `git push` → "Everything up-to-date", the button
 * reported success, and the section stayed behind — a control that claims to have done
 * work and did none. Ordering and the pull-failure short-circuit are the whole contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { VscodeScmActionButton } from './vscode-scm-action-button'
import type { VscodeScmContext } from './use-vscode-scm-context'

const calls = vi.hoisted(() => ({ order: [] as string[] }))
const pullMock = vi.hoisted(() => vi.fn())
const pushMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => null }))
vi.mock('@/runtime/runtime-git-client', () => ({
  pullRuntimeGitSubmodule: async (...args: unknown[]) => {
    calls.order.push('pull')
    return pullMock(...args)
  },
  pushRuntimeGitSubmodule: async (...args: unknown[]) => {
    calls.order.push('push')
    return pushMock(...args)
  },
  commitRuntimeGitSubmodule: vi.fn(),
  discardRuntimeGitSubmodulePath: vi.fn(),
  stageRuntimeGitSubmodulePaths: vi.fn(),
  unstageRuntimeGitSubmodulePaths: vi.fn()
}))

import { useVscodeScmSubmoduleMutations } from './use-vscode-scm-submodule-mutations'

const SUBMODULE_PATH = 'vendor/sdk'

function scmContext(): VscodeScmContext {
  return {
    worktreeId: 'worktree-1',
    worktreePath: '/work/orca',
    repoSettings: null,
    refresh: vi.fn()
  } as unknown as VscodeScmContext
}

function button(kind: VscodeScmActionButton['kind'], behind: number): VscodeScmActionButton {
  return {
    kind,
    enabled: true,
    disabledReason: null,
    stagesAllFirst: false,
    ahead: 0,
    behind,
    operation: null
  }
}

describe('submodule Sync Changes', () => {
  beforeEach(() => {
    calls.order = []
    pullMock.mockReset().mockResolvedValue(undefined)
    pushMock.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  function renderMutations() {
    return renderHook(() => useVscodeScmSubmoduleMutations(scmContext(), vi.fn()))
  }

  it('pulls before it pushes when the submodule is behind only', async () => {
    const { result } = renderMutations()

    let ok = false
    await act(async () => {
      ok = await result.current.run(SUBMODULE_PATH, button('sync', 2), '', [])
    })

    expect(ok).toBe(true)
    expect(calls.order).toEqual(['pull', 'push'])
    expect(pullMock).toHaveBeenCalledWith(expect.anything(), SUBMODULE_PATH)
    expect(result.current.errorByPath[SUBMODULE_PATH]).toBeUndefined()
  })

  it('does not push when the pull fails, and surfaces the pull error', async () => {
    pullMock.mockRejectedValue(new Error('CONFLICT (content): Merge conflict in a.txt'))
    const { result } = renderMutations()

    let ok = true
    await act(async () => {
      ok = await result.current.run(SUBMODULE_PATH, button('sync', 1), '', [])
    })

    expect(ok).toBe(false)
    expect(calls.order).toEqual(['pull'])
    expect(pushMock).not.toHaveBeenCalled()
    expect(result.current.errorByPath[SUBMODULE_PATH]).toBe(
      'CONFLICT (content): Merge conflict in a.txt'
    )
  })

  it('publish still pushes only, with publish=true', async () => {
    const { result } = renderMutations()

    await act(async () => {
      await result.current.run(SUBMODULE_PATH, button('publish', 0), '', [])
    })

    expect(calls.order).toEqual(['push'])
    expect(pushMock).toHaveBeenCalledWith(expect.anything(), SUBMODULE_PATH, true)
  })
})

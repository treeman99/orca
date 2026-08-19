// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getRuntimeGitSubmoduleStatus: vi.fn() }))

vi.mock('@/runtime/runtime-git-client', () => ({
  getRuntimeGitSubmoduleStatus: mocks.getRuntimeGitSubmoduleStatus
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))

import {
  useSourceControlSubmoduleStatus,
  type UseSourceControlSubmoduleStatusResult
} from './useSourceControlSubmoduleStatus'
import type { GitStatusEntry } from '../../../../shared/git-status-types'

const roots: Root[] = []

function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
} {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

let latest: UseSourceControlSubmoduleStatusResult | null = null

function Probe({
  worktreeId,
  worktreePath,
  entries,
  settings = null
}: {
  worktreeId: string
  worktreePath: string
  entries: GitStatusEntry[]
  settings?: { activeRuntimeEnvironmentId: string | null } | null
}): null {
  latest = useSourceControlSubmoduleStatus({
    activeWorktreeId: worktreeId,
    worktreePath,
    activeRepoSettings: settings,
    entries
  })
  return null
}

function innerEntry(path: string): GitStatusEntry {
  return { path, status: 'modified', area: 'unstaged' } as GitStatusEntry
}

function submoduleEntry(area: GitStatusEntry['area'] = 'unstaged'): GitStatusEntry {
  return {
    path: 'sub',
    status: 'modified',
    area,
    submodule: { commitChanged: true, trackedChanges: false, untrackedChanges: false }
  } as GitStatusEntry
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) {
      root.unmount()
    }
  })
  mocks.getRuntimeGitSubmoduleStatus.mockReset()
  latest = null
})

describe('useSourceControlSubmoduleStatus', () => {
  it('drops a late response from a previous worktree when the active worktree changed', async () => {
    const a = deferred<{ entries: GitStatusEntry[] }>()
    const b = deferred<{ entries: GitStatusEntry[] }>()
    mocks.getRuntimeGitSubmoduleStatus.mockImplementation((ctx: { worktreeId?: string | null }) =>
      ctx.worktreeId === 'A' ? a.promise : b.promise
    )

    const container = document.createElement('div')
    const root = createRoot(container)
    roots.push(root)

    await act(async () => {
      root.render(<Probe worktreeId="A" worktreePath="/a" entries={[submoduleEntry()]} />)
    })
    // Expand a submodule in worktree A -> issues the (slow) A request.
    await act(async () => {
      latest?.toggleSubmodule(submoduleEntry())
    })
    await flush()

    // Switch to worktree B (same submodule path) and expand it there.
    await act(async () => {
      root.render(<Probe worktreeId="B" worktreePath="/b" entries={[submoduleEntry()]} />)
    })
    await act(async () => {
      latest?.toggleSubmodule(submoduleEntry())
    })
    await flush()

    // B resolves first, then the stale A response arrives late.
    await act(async () => {
      b.resolve({ entries: [innerEntry('from-b.ts')] })
    })
    await flush()
    await act(async () => {
      a.resolve({ entries: [innerEntry('from-a.ts')] })
    })
    await flush()

    expect(latest?.submoduleStatusByKey['unstaged::sub']).toEqual({
      status: 'loaded',
      entries: [innerEntry('from-b.ts')]
    })
  })

  it('does not let a late error from a previous worktree overwrite the current status', async () => {
    const a = deferred<{ entries: GitStatusEntry[] }>()
    const b = deferred<{ entries: GitStatusEntry[] }>()
    mocks.getRuntimeGitSubmoduleStatus.mockImplementation((ctx: { worktreeId?: string | null }) =>
      ctx.worktreeId === 'A' ? a.promise : b.promise
    )

    const container = document.createElement('div')
    const root = createRoot(container)
    roots.push(root)

    await act(async () => {
      root.render(<Probe worktreeId="A" worktreePath="/a" entries={[submoduleEntry()]} />)
    })
    await act(async () => {
      latest?.toggleSubmodule(submoduleEntry())
    })
    await flush()

    await act(async () => {
      root.render(<Probe worktreeId="B" worktreePath="/b" entries={[submoduleEntry()]} />)
    })
    await act(async () => {
      latest?.toggleSubmodule(submoduleEntry())
    })
    await flush()

    await act(async () => {
      b.resolve({ entries: [innerEntry('from-b.ts')] })
    })
    await flush()
    await act(async () => {
      a.reject(new Error('stale worktree failed'))
    })
    await flush()

    expect(latest?.submoduleStatusByKey['unstaged::sub']).toEqual({
      status: 'loaded',
      entries: [innerEntry('from-b.ts')]
    })
  })

  it('drops a late response from a previous runtime target on the same worktree', async () => {
    const envA = deferred<{ entries: GitStatusEntry[] }>()
    const envB = deferred<{ entries: GitStatusEntry[] }>()
    mocks.getRuntimeGitSubmoduleStatus.mockImplementation(
      (ctx: { settings?: { activeRuntimeEnvironmentId?: string | null } | null }) =>
        ctx.settings?.activeRuntimeEnvironmentId === 'env-b' ? envB.promise : envA.promise
    )

    const container = document.createElement('div')
    const root = createRoot(container)
    roots.push(root)

    await act(async () => {
      root.render(
        <Probe
          worktreeId="A"
          worktreePath="/a"
          settings={{ activeRuntimeEnvironmentId: 'env-a' }}
          entries={[submoduleEntry()]}
        />
      )
    })
    await act(async () => {
      latest?.toggleSubmodule(submoduleEntry())
    })
    await flush()

    await act(async () => {
      root.render(
        <Probe
          worktreeId="A"
          worktreePath="/a"
          settings={{ activeRuntimeEnvironmentId: 'env-b' }}
          entries={[submoduleEntry()]}
        />
      )
    })
    await act(async () => {
      latest?.toggleSubmodule(submoduleEntry())
    })
    await flush()

    await act(async () => {
      envB.resolve({ entries: [innerEntry('from-env-b.ts')] })
    })
    await flush()
    await act(async () => {
      envA.resolve({ entries: [innerEntry('from-env-a.ts')] })
    })
    await flush()

    expect(latest?.submoduleStatusByKey['unstaged::sub']).toEqual({
      status: 'loaded',
      entries: [innerEntry('from-env-b.ts')]
    })
  })

  // A staged gitlink row no longer opens: its expansion would repeat the submodule status
  // the unstaged row already shows, and staging a gitlink records a pointer, not contents.
  it('never fetches for a staged submodule row', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    roots.push(root)
    const stagedEntry = submoduleEntry('staged')

    await act(async () => {
      root.render(<Probe worktreeId="A" worktreePath="/a" entries={[stagedEntry]} />)
    })
    await act(async () => {
      latest?.toggleSubmodule(stagedEntry)
    })
    await flush()

    expect(mocks.getRuntimeGitSubmoduleStatus).not.toHaveBeenCalled()
    expect(latest?.submoduleStatusByKey['staged::sub']).toBeUndefined()
  })

  it('keeps the submodule own branch and head from the inner status', async () => {
    // Why: the submodule routinely sits on a different branch than the root; the
    // inner status already carries it, and dropping it left the panel unable to
    // tell the two repositories apart.
    mocks.getRuntimeGitSubmoduleStatus.mockResolvedValue({
      entries: [innerEntry('subfile.txt')],
      branch: 'refs/heads/other-branch',
      head: '031c1df1f5107f0c449f65f563df0ee61d6769f1'
    })

    const container = document.createElement('div')
    const root = createRoot(container)
    roots.push(root)

    await act(async () => {
      root.render(<Probe worktreeId="A" worktreePath="/a" entries={[submoduleEntry()]} />)
    })
    await act(async () => {
      latest?.toggleSubmodule(submoduleEntry())
    })
    await flush()

    expect(latest?.submoduleStatusByKey['unstaged::sub']).toEqual({
      status: 'loaded',
      entries: [innerEntry('subfile.txt')],
      branch: 'refs/heads/other-branch',
      head: '031c1df1f5107f0c449f65f563df0ee61d6769f1'
    })
  })

  it('refetches an expanded submodule while the parent entries stay referentially stable', async () => {
    // Why: editing inside an already-dirty submodule leaves the parent gitlink row
    // byte-identical, so the status slice hands back the SAME array; without an
    // independent tick the inner file list froze at the moment of expansion.
    vi.useFakeTimers()
    try {
      mocks.getRuntimeGitSubmoduleStatus.mockResolvedValue({ entries: [innerEntry('a.ts')] })
      const stableEntries = [submoduleEntry()]

      const container = document.createElement('div')
      const root = createRoot(container)
      roots.push(root)

      await act(async () => {
        root.render(<Probe worktreeId="A" worktreePath="/a" entries={stableEntries} />)
      })
      await act(async () => {
        latest?.toggleSubmodule(submoduleEntry())
      })
      await flush()

      const callsAfterExpand = mocks.getRuntimeGitSubmoduleStatus.mock.calls.length
      expect(callsAfterExpand).toBeGreaterThan(0)

      // Re-render with the very same array reference, then let the tick fire.
      await act(async () => {
        root.render(<Probe worktreeId="A" worktreePath="/a" entries={stableEntries} />)
      })
      await flush()
      await act(async () => {
        vi.advanceTimersByTime(4000)
      })
      await flush()

      expect(mocks.getRuntimeGitSubmoduleStatus.mock.calls.length).toBeGreaterThan(callsAfterExpand)
    } finally {
      vi.useRealTimers()
    }
  })

  it('runs no interval git work while every submodule is collapsed', async () => {
    // Why: a repo with dozens of submodules must not pay per-poll git spawns for
    // rows the user never opened.
    vi.useFakeTimers()
    try {
      mocks.getRuntimeGitSubmoduleStatus.mockResolvedValue({ entries: [] })

      const container = document.createElement('div')
      const root = createRoot(container)
      roots.push(root)

      await act(async () => {
        root.render(<Probe worktreeId="A" worktreePath="/a" entries={[submoduleEntry()]} />)
      })
      await act(async () => {
        vi.advanceTimersByTime(60_000)
      })
      await flush()

      expect(mocks.getRuntimeGitSubmoduleStatus).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('spawns exactly one inner status when a submodule is expanded', async () => {
    // Why: the refresh interval also runs on install. Keying it on the Set made
    // every expand reinstall the timer and fire that run, doubling the git spawn.
    vi.useFakeTimers()
    try {
      mocks.getRuntimeGitSubmoduleStatus.mockResolvedValue({ entries: [innerEntry('a.ts')] })

      const container = document.createElement('div')
      const root = createRoot(container)
      roots.push(root)

      await act(async () => {
        root.render(<Probe worktreeId="A" worktreePath="/a" entries={[submoduleEntry()]} />)
      })
      await act(async () => {
        latest?.toggleSubmodule(submoduleEntry())
      })
      await flush()

      expect(mocks.getRuntimeGitSubmoduleStatus).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not queue a second inner status while one is still in flight', async () => {
    // Why: the parent poll and the expanded-submodule tick are independent
    // clocks, so a slow submodule would otherwise accumulate stacked git spawns.
    vi.useFakeTimers()
    const pending = deferred<{ entries: GitStatusEntry[] }>()
    try {
      mocks.getRuntimeGitSubmoduleStatus.mockReturnValue(pending.promise)

      const container = document.createElement('div')
      const root = createRoot(container)
      roots.push(root)

      await act(async () => {
        root.render(<Probe worktreeId="A" worktreePath="/a" entries={[submoduleEntry()]} />)
      })
      await act(async () => {
        latest?.toggleSubmodule(submoduleEntry())
      })
      await flush()
      expect(mocks.getRuntimeGitSubmoduleStatus).toHaveBeenCalledTimes(1)

      // Three ticks pass while the first request is still unresolved.
      await act(async () => {
        vi.advanceTimersByTime(12_000)
      })
      await flush()

      expect(mocks.getRuntimeGitSubmoduleStatus).toHaveBeenCalledTimes(1)

      // Once it settles, the next tick is free to refresh again.
      await act(async () => {
        pending.resolve({ entries: [innerEntry('a.ts')] })
      })
      await flush()
      await act(async () => {
        vi.advanceTimersByTime(4000)
      })
      await flush()

      expect(mocks.getRuntimeGitSubmoduleStatus.mock.calls.length).toBeGreaterThan(1)
    } finally {
      pending.resolve({ entries: [] })
      vi.useRealTimers()
    }
  })
})

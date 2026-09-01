// The dispatch path's composer gate.
//
// `tui-idle` proves an agent owns the pane; it does not prove the agent has a composer. For an
// opencode pane whose title has not become `OC | …` yet, readiness settles on a generic
// ready-prompt preview, and opencode then stays silent for ~1.5-2 s while it mounts. A bracketed
// paste written into that window is dropped when the TUI drains stdin at init — the worker ends
// up with an empty composer and Orca has no evidence anywhere that anything was lost.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'
import { makeStore } from './runtime-rpc-worktree-store-fixtures'

const WORKTREE_PATH = '/tmp/worktree-a'
const PTY_ID = 'pty-composer'

// Why: `makeStore` supplies the repo, but createTerminal resolves the worktree through git.
vi.mock('../git/worktree', () => {
  const worktrees = [
    {
      path: '/tmp/worktree-a',
      head: 'abc',
      branch: 'feature/composer-ready',
      isBare: false,
      isMainWorktree: false
    }
  ]
  return {
    listWorktrees: vi.fn().mockResolvedValue(worktrees),
    listWorktreesStrict: vi.fn().mockResolvedValue(worktrees)
  }
})

const DECSET_BRACKETED_PASTE = '\x1b[?2004h'
const SHOW_CURSOR = '\x1b[?25h'

async function createRuntime(
  launchAgent: 'opencode' | 'aider'
): Promise<{ runtime: OrcaRuntimeService; handle: string }> {
  const runtime = new OrcaRuntimeService(makeStore() as never)
  runtime.setPtyController({
    spawn: vi.fn().mockResolvedValue({ id: PTY_ID }),
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => null
  })
  const terminal = await runtime.createTerminal(`path:${WORKTREE_PATH}`, { launchAgent })
  return { runtime, handle: terminal.handle }
}

describe('agent composer readiness before a dispatched prompt', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not settle for opencode until the composer paints', async () => {
    vi.useFakeTimers()
    const { runtime, handle } = await createRuntime('opencode')
    let settled = false
    const ready = runtime.waitForAgentComposerReady(handle, 'opencode').then((value) => {
      settled = true
      return value
    })

    // Bracketed paste enabled, composer not mounted: exactly the window the paste was lost in.
    runtime.onPtyData(PTY_ID, DECSET_BRACKETED_PASTE, Date.now())
    await vi.advanceTimersByTimeAsync(1_500)
    expect(settled).toBe(false)

    runtime.onPtyData(PTY_ID, SHOW_CURSOR, Date.now())
    await vi.advanceTimersByTimeAsync(0)

    await expect(ready).resolves.toBe(true)
  })

  it('gives up on its own deadline so a silent agent cannot wedge the dispatch', async () => {
    vi.useFakeTimers()
    const { runtime, handle } = await createRuntime('opencode')
    const ready = runtime.waitForAgentComposerReady(handle, 'opencode')

    await vi.advanceTimersByTimeAsync(60_000)

    // False, not a hang: worker-start still writes the prompt, and the receipt still reports how
    // the submit ended. A bounded wait is the point, not a guarantee.
    await expect(ready).resolves.toBe(false)
  })

  it('is a no-op for an agent that declares no composer signal', async () => {
    vi.useFakeTimers()
    const { runtime, handle } = await createRuntime('aider')

    await expect(runtime.waitForAgentComposerReady(handle, 'aider')).resolves.toBe(true)
  })
})

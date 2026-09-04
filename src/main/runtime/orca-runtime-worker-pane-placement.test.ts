// The seam an upstream re-split silently drops.
//
// `paneGroupPlacement` is minted in orchestration-worker-topology.ts, forwarded by
// createTerminal, and consumed in the renderer. The existing coverage brackets that
// forward without crossing it — orchestration-composed-workers.test.ts mocks
// `createTerminal` outright, useIpcEvents-terminal-create-worker-pane.test.ts starts
// from an IPC payload that already carries the field, and
// orchestration-worker-pane-column.test.ts tests the claim in isolation. So when
// v1.4.196's OrcaRuntimeService split dropped both forwarding lines, every one of
// them stayed green and dispatched workers quietly landed as another tab in the
// coordinator's group. This file is the missing middle.

import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'

vi.mock('electron', () => ({
  BrowserWindow: { fromId: vi.fn(() => null) },
  webContents: { fromId: vi.fn(() => null) },
  ipcMain: {
    on: vi.fn(),
    removeListener: vi.fn()
  },
  app: { getPath: vi.fn(() => '/tmp') }
}))

const PLACEMENT = { kind: 'orchestration-worker', coordinatorTabId: 'tab_coord' } as const

function stubLaunchScope(runtime: OrcaRuntimeService): void {
  const internals = runtime as unknown as {
    resolveTerminalWorkspaceLaunchScope: (selector: string) => Promise<{
      id: string
      path: string
      connectionId: string | null
      repo: null
      folderWorkspace: null
    }>
  }
  vi.spyOn(internals, 'resolveTerminalWorkspaceLaunchScope').mockResolvedValue({
    id: 'wt-1',
    path: '/repo/app',
    connectionId: null,
    repo: null,
    folderWorkspace: null
  })
}

function attachRuntime(runtime: OrcaRuntimeService): { revealTerminalSession: ReturnType<typeof vi.fn> } {
  const revealTerminalSession = vi.fn().mockResolvedValue({ tabId: 'tab-1' })
  runtime.setPtyController({
    spawn: vi.fn().mockResolvedValue({ id: 'pty-1' }),
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => null
  })
  runtime.setNotifier({
    worktreesChanged: vi.fn(),
    reposChanged: vi.fn(),
    activateWorktree: vi.fn(),
    createTerminal: vi.fn(),
    revealTerminalSession,
    splitTerminal: vi.fn(),
    renameTerminal: vi.fn(),
    focusTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    sleepWorktree: vi.fn(),
    terminalFitOverrideChanged: vi.fn(),
    terminalDriverChanged: vi.fn()
  })
  return { revealTerminalSession }
}

describe('OrcaRuntimeService worker pane placement', () => {
  it('forwards the coordinator anchor to the renderer on the reveal path', async () => {
    const runtime = new OrcaRuntimeService()
    stubLaunchScope(runtime)
    const { revealTerminalSession } = attachRuntime(runtime)

    // The shape orchestration-worker-topology.ts sends for a same-worktree dispatch.
    await runtime.createTerminal('id:wt-1', {
      title: 'worker-task_1',
      surfaceOwner: false,
      paneGroupPlacement: PLACEMENT
    })

    expect(revealTerminalSession).toHaveBeenCalledWith(
      'wt-1',
      expect.objectContaining({ paneGroupPlacement: PLACEMENT })
    )
  })

  // Why asserted rather than assumed absent: the renderer treats the field as advisory,
  // so a stray anchor would split a pane for a terminal nobody dispatched.
  it('sends no anchor when the dispatch did not name one', async () => {
    const runtime = new OrcaRuntimeService()
    stubLaunchScope(runtime)
    const { revealTerminalSession } = attachRuntime(runtime)

    await runtime.createTerminal('id:wt-1', { title: 'plain', surfaceOwner: false })

    expect(revealTerminalSession).toHaveBeenCalledWith(
      'wt-1',
      expect.not.objectContaining({ paneGroupPlacement: expect.anything() })
    )
  })
})

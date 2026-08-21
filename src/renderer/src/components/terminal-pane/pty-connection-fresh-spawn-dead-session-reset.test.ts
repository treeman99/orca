import type * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildRestoredViewportResetSequence } from './terminal-restored-viewport'
import { flushAsyncTicks } from './pty-connection-test-async'
import {
  LEAF_1,
  createMockTransport,
  createPane,
  createManager
} from './pty-connection-test-pane-fixtures'
import type { ConnectCallbacks, MockTransport } from './pty-connection-test-pane-fixtures'
import { buildPaneConnectionDeps } from './pty-connection-test-deps'
import { createInitialStoreState } from './pty-connection-test-store-fixtures'
import type { StoreState } from './pty-connection-test-store-state'
import {
  installTerminalTestGlobals,
  restoreTerminalTestGlobals
} from './pty-connection-test-environment'

const {
  resetAndRefreshAllTerminalWebglAtlases,
  scheduleTerminalWebglAtlasRecovery,
  scheduleRuntimeGraphSync,
  shouldSeedCacheTimerOnInitialTitle,
  toastInfo,
  notifyCodexPaneBoundForStaleSweep
} = vi.hoisted(() => ({
  resetAndRefreshAllTerminalWebglAtlases: vi.fn(),
  scheduleTerminalWebglAtlasRecovery: vi.fn(),
  scheduleRuntimeGraphSync: vi.fn(),
  shouldSeedCacheTimerOnInitialTitle: vi.fn(() => false),
  toastInfo: vi.fn(),
  notifyCodexPaneBoundForStaleSweep: vi.fn()
}))

let mockStoreState: StoreState
let transportFactoryQueue: MockTransport[] = []
let createdTransportOptions: Record<string, unknown>[] = []
let storeSubscribers: ((state: StoreState) => void)[] = []

vi.mock('@/runtime/sync-runtime-graph', () => ({
  scheduleRuntimeGraphSync
}))

vi.mock('@/lib/pane-manager/pane-manager-registry', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resetAndRefreshAllTerminalWebglAtlases
}))

vi.mock('./terminal-webgl-atlas-recovery', () => ({
  scheduleTerminalWebglAtlasRecovery
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mockStoreState,
    subscribe: (listener: (state: StoreState) => void) => {
      storeSubscribers.push(listener)
      return () => {
        storeSubscribers = storeSubscribers.filter((candidate) => candidate !== listener)
      }
    }
  }
}))

vi.mock('@/lib/agent-status', async (importOriginal) => {
  const { buildAgentStatusModuleMock } = await import('./pty-connection-test-environment')
  return buildAgentStatusModuleMock(await importOriginal<Record<string, unknown>>())
})

vi.mock('./cache-timer-seeding', () => ({
  shouldSeedCacheTimerOnInitialTitle
}))

vi.mock('sonner', () => ({
  toast: {
    info: toastInfo
  }
}))

vi.mock('@/lib/codex-stale-pane-sweep', () => ({
  notifyCodexPaneBoundForStaleSweep
}))

// Why: the working→idle test invokes the real useNotificationDispatch hook outside React, so useCallback must pass through (safe suite-wide: no test here renders React).
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return {
    ...actual,
    useCallback: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn
  }
})

vi.mock('./pty-transport', () => ({
  createIpcPtyTransport: vi.fn((options: Record<string, unknown>) => {
    createdTransportOptions.push(options)
    const nextTransport = transportFactoryQueue.shift()
    if (!nextTransport) {
      throw new Error('No mock transport queued')
    }
    return nextTransport
  })
}))

vi.mock('./remote-runtime-pty-transport', () => ({
  createRemoteRuntimePtyTransport: vi.fn(
    (_environmentId: string, options: Record<string, unknown>) => {
      createdTransportOptions.push(options)
      const nextTransport = transportFactoryQueue.shift()
      if (!nextTransport) {
        throw new Error('No mock transport queued')
      }
      return nextTransport
    }
  )
}))

// Why: stub only getEagerPtyBufferHandle so tests can simulate a live eager buffer (adopt path) without standing up the real IPC dispatcher.
vi.mock('./pty-dispatcher', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getEagerPtyBufferHandle: vi.fn(() => undefined)
  }
})

function createDeps(overrides: Record<string, unknown> = {}) {
  return buildPaneConnectionDeps(() => mockStoreState, overrides)
}

// A dead session hands its pane to a REPLACEMENT shell, so nothing on screen —
// alt screen, modes, pen, saved cursor — belongs to anyone any more. Blanking the
// viewport alone leaves a dead agent TUI's `?1049h` standing: the scroll then runs
// on the alternate buffer and the next `?1049l` drops the fresh shell back onto the
// restored conversation. Pin the wiring, not just the sequence builder.
describe('connectPanePty fresh spawn after the restored session died', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    transportFactoryQueue = []
    createdTransportOptions = []
    storeSubscribers = []
    mockStoreState = createInitialStoreState(() => mockStoreState)
    installTerminalTestGlobals()
  })

  afterEach(async () => {
    await restoreTerminalTestGlobals()
  })

  function createRecordingPane(written: string[], rows: number, cols: number) {
    const pane = createPane(1)
    pane.terminal.rows = rows
    pane.terminal.cols = cols
    pane.terminal.write = vi.fn((data: string, callback?: () => void) => {
      written.push(data)
      callback?.()
    })
    return pane
  }

  /** Reattach reports the session gone, so the pane fresh-spawns in place. */
  function queueExpiredSessionTransport(): MockTransport {
    const transport = createMockTransport('tab-pty')
    transport.connect.mockImplementation(
      async ({ sessionId, callbacks }: { sessionId?: string; callbacks: ConnectCallbacks }) => {
        if (sessionId) {
          return { id: sessionId, sessionExpired: true }
        }
        callbacks.onData?.('live $ ')
        return { id: 'fresh-pty' }
      }
    )
    transportFactoryQueue.push(transport)
    return transport
  }

  it('grounds a dead agent TUI alt screen before the replacement shell writes', async () => {
    const { connectPanePty } = await import('./pty-connection')
    queueExpiredSessionTransport()
    mockStoreState = {
      ...mockStoreState,
      tabsByWorktree: { 'wt-1': [{ id: 'tab-1', ptyId: 'tab-pty' }] }
    } as StoreState

    const written: string[] = []
    const pane = createRecordingPane(written, 4, 24)
    // The dead TUI never balanced its `?1049h`.
    pane.terminal.buffer.active.type = 'alternate'
    const deps = createDeps({
      restoredLeafId: LEAF_1,
      restoredPtyIdByLeafId: { [LEAF_1]: 'tab-pty' },
      restoredViewportBlankingPanesRef: { current: new Set([1]) }
    })

    connectPanePty(pane as never, createManager(1) as never, deps as never)
    await flushAsyncTicks(20)

    const reset = buildRestoredViewportResetSequence({
      rows: 4,
      paneOnAlternateScreen: true,
      ownerProcessEnded: true
    })
    expect(reset).toContain('\x1b[?1049l')
    expect(written).toContain(reset)
    expect(written.indexOf(reset)).toBeLessThan(written.indexOf('live $ '))
  })

  it('grounds a normal-buffer pane the same way, without the alt-screen exit', async () => {
    const { connectPanePty } = await import('./pty-connection')
    queueExpiredSessionTransport()
    mockStoreState = {
      ...mockStoreState,
      tabsByWorktree: { 'wt-1': [{ id: 'tab-1', ptyId: 'tab-pty' }] }
    } as StoreState

    const written: string[] = []
    const pane = createRecordingPane(written, 4, 24)
    const deps = createDeps({
      restoredLeafId: LEAF_1,
      restoredPtyIdByLeafId: { [LEAF_1]: 'tab-pty' },
      restoredViewportBlankingPanesRef: { current: new Set([1]) }
    })

    connectPanePty(pane as never, createManager(1) as never, deps as never)
    await flushAsyncTicks(20)

    const reset = buildRestoredViewportResetSequence({
      rows: 4,
      paneOnAlternateScreen: false,
      ownerProcessEnded: true
    })
    expect(written).toContain(reset)
    expect(reset).not.toContain('\x1b[?1049l')
    // No `clear` is typed into the replacement shell's input buffer.
    expect(createdTransportOptions.some((options) => options.command === 'clear')).toBe(false)
  })
})

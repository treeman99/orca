import type * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildFreshShellViewportBlankingSequence } from './terminal-restored-viewport'
import { flushAsyncTicks, renderHeadlessTerminalState } from './pty-connection-test-async'
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

// A restored pane paints its persisted layout buffer into a fresh xterm and is marked
// for viewport blanking. Only a payload branch clears + re-anchors it; a reattach that
// resolves with none must blank, or the live session overwrites the restored rows.
describe('connectPanePty payload-less reattach over a restored viewport', () => {
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

  function reattachStoreState(): StoreState {
    return {
      ...mockStoreState,
      tabsByWorktree: { 'wt-1': [{ id: 'tab-1', ptyId: 'tab-pty' }] }
    } as StoreState
  }

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

  it('blanks the restored viewport when the reattach carries no payload', async () => {
    const { connectPanePty } = await import('./pty-connection')
    const transport = createMockTransport('tab-pty')
    const written: string[] = []
    transport.connect.mockImplementation(
      async ({ sessionId, callbacks }: { sessionId?: string; callbacks: ConnectCallbacks }) => {
        if (!sessionId) {
          return null
        }
        callbacks.onData?.('live $ ')
        return { id: sessionId, isReattach: true }
      }
    )
    transportFactoryQueue.push(transport)
    mockStoreState = reattachStoreState()

    const blankingPanes = new Set([1])
    const pane = createRecordingPane(written, 4, 24)
    const manager = createManager(1)
    const deps = createDeps({
      restoredLeafId: LEAF_1,
      restoredPtyIdByLeafId: { [LEAF_1]: 'tab-pty' },
      restoredViewportBlankingPanesRef: { current: blankingPanes }
    })

    connectPanePty(pane as never, manager as never, deps as never)
    await flushAsyncTicks(20)

    const blankViewport = buildFreshShellViewportBlankingSequence(4)
    expect(written).toContain(blankViewport)
    expect(blankingPanes.has(1)).toBe(false)

    // Restored rows must survive in scrollback while the live prompt starts clean.
    const rendered = await renderHeadlessTerminalState(
      ['restored row one\r\nrestored row two', blankViewport, 'live $ '],
      24,
      4
    )
    expect(rendered.baseY).toBeGreaterThan(0)
    expect(rendered.allLines.some((line) => line?.includes('restored row one'))).toBe(true)
    expect(rendered.visibleLines).toEqual(['live $ ', '', '', ''])
  })

  it('leaves the marker for a later fresh spawn when a snapshot repainted the pane', async () => {
    const { connectPanePty } = await import('./pty-connection')
    const transport = createMockTransport('tab-pty')
    const written: string[] = []
    transport.connect.mockImplementation(async ({ sessionId }: { sessionId?: string }) => {
      return sessionId ? { id: sessionId, snapshot: 'snapshot-payload', isReattach: true } : null
    })
    transportFactoryQueue.push(transport)
    mockStoreState = reattachStoreState()

    const blankingPanes = new Set([1])
    const pane = createRecordingPane(written, 4, 24)
    const manager = createManager(1)
    const deps = createDeps({
      restoredLeafId: LEAF_1,
      restoredPtyIdByLeafId: { [LEAF_1]: 'tab-pty' },
      restoredViewportBlankingPanesRef: { current: blankingPanes }
    })

    connectPanePty(pane as never, manager as never, deps as never)
    await flushAsyncTicks(20)

    // Substring, not array membership: v1.4.188 prefixes every replay write with
    // RESET_GRAPHIC_RENDITION, so the snapshot no longer arrives as its own bare entry.
    expect(written.some((chunk) => chunk.includes('snapshot-payload'))).toBe(true)
    // The snapshot's own clear re-anchored the pane, so blanking would wipe it.
    expect(written).not.toContain(buildFreshShellViewportBlankingSequence(4))
    expect(blankingPanes.has(1)).toBe(true)
  })
})

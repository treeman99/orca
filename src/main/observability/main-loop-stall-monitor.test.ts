import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createIpcDispatchTiming, IPC_DISPATCH_EVENTS } from './main-ipc-dispatch-timing'
import {
  createMainLoopStallMonitor,
  MAIN_LOOP_SAMPLE_INTERVAL_MS,
  MAIN_LOOP_STALL_TOPIC,
  type MainLoopStallMonitorDeps
} from './main-loop-stall-monitor'

type Harness = {
  deps: MainLoopStallMonitorDeps
  clock: { mono: number; cpu: number }
  write: ReturnType<typeof vi.fn>
  setIntervalSpy: ReturnType<typeof vi.fn>
  observeGc: ReturnType<typeof vi.fn>
  recordGc: (start: number, duration: number) => void
}

function harness(overrides: Partial<MainLoopStallMonitorDeps> = {}): Harness {
  const clock = { mono: 1_000, cpu: 0 }
  const write = vi.fn()
  const setIntervalSpy = vi.fn(() => ({ id: 'timer' }))
  let gcRecorder: ((start: number, duration: number) => void) | null = null
  const observeGc = vi.fn((record: (start: number, duration: number) => void) => {
    gcRecorder = record
    return () => {
      gcRecorder = null
    }
  })
  const deps: MainLoopStallMonitorDeps = {
    now: () => clock.mono,
    // Wall clock pinned to the monotonic one so `start` is predictable.
    wallNow: () => new Date(2026, 8, 15, 10, 0, 0, 0).getTime() + clock.mono,
    cpuMs: () => clock.cpu,
    cpuScope: 'thread',
    setInterval: setIntervalSpy,
    clearInterval: vi.fn(),
    write,
    observeGc,
    ...overrides
  }
  return { deps, clock, write, setIntervalSpy, observeGc, recordGc: (s, d) => gcRecorder?.(s, d) }
}

describe('main loop stall monitor', () => {
  it('registers no timer, GC observer, or IPC listener while the log is off', () => {
    const attachAll = vi.fn()
    const h = harness()
    const monitor = createMainLoopStallMonitor({
      ...h.deps,
      ipc: { ...createIpcDispatchTiming(() => 0), attachAll }
    })

    monitor.setEnabled(false)

    expect(monitor.isArmed()).toBe(false)
    expect(h.setIntervalSpy).not.toHaveBeenCalled()
    expect(h.observeGc).not.toHaveBeenCalled()
    expect(attachAll).not.toHaveBeenCalled()
  })

  it('arms once, and disarming disposes the GC observer and IPC listeners', () => {
    const detachAll = vi.fn()
    const h = harness()
    const timing = createIpcDispatchTiming(() => 0)
    const monitor = createMainLoopStallMonitor({
      ...h.deps,
      ipc: { ...timing, attachAll: vi.fn(), detachAll }
    })

    monitor.setEnabled(true)
    monitor.setEnabled(true)
    expect(h.setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(h.setIntervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      MAIN_LOOP_SAMPLE_INTERVAL_MS
    )

    monitor.setEnabled(false)
    expect(monitor.isArmed()).toBe(false)
    expect(h.deps.clearInterval).toHaveBeenCalledWith({ id: 'timer' })
    expect(detachAll).toHaveBeenCalledTimes(1)
  })

  it('stays quiet for on-time ticks and small drift', () => {
    const h = harness()
    const monitor = createMainLoopStallMonitor(h.deps)
    monitor.setEnabled(true)

    for (const step of [100, 110, 250]) {
      h.clock.mono += step
      monitor.tick()
    }
    monitor.tick()

    expect(h.write).not.toHaveBeenCalled()
  })

  it('reports a stall with its event time, CPU and GC share one tick later', () => {
    const h = harness()
    const monitor = createMainLoopStallMonitor(h.deps)
    monitor.setEnabled(true)
    const armedAt = h.clock.mono

    h.clock.mono += 100 + 700
    h.clock.cpu += 650
    monitor.tick()
    // GC entries arrive after the pause, so the line waits for the next tick.
    expect(h.write).not.toHaveBeenCalled()
    h.recordGc(armedAt + 300, 120)
    h.recordGc(armedAt - 5_000, 50)

    h.clock.mono += 100
    monitor.tick()

    expect(h.write).toHaveBeenCalledTimes(1)
    expect(h.write).toHaveBeenCalledWith(MAIN_LOOP_STALL_TOPIC, {
      start: '10:00:01.100',
      ms: 700,
      cpuMs: 650,
      cpu: 'thread',
      gcMs: 120,
      ipc: undefined,
      ipcMs: undefined,
      ipcCount: undefined
    })
  })

  it('does not carry an unreported stall across turning the log off and on', () => {
    const h = harness()
    const monitor = createMainLoopStallMonitor(h.deps)
    monitor.setEnabled(true)
    h.clock.mono += 600
    monitor.tick()

    monitor.setEnabled(false)
    monitor.setEnabled(true)
    h.clock.mono += 100
    monitor.tick()

    expect(h.write).not.toHaveBeenCalled()
  })

  it('names the slowest synchronous IPC dispatch inside the stalled window', () => {
    const h = harness()
    const timing = createIpcDispatchTiming(() => h.clock.mono)
    const session = new EventEmitter()
    // Stands in for Electron's own dispatch listener, registered before ours.
    session.on('-ipc-invoke', (_event, channel: string) => {
      h.clock.mono += channel === 'git:status' ? 640 : 5
    })
    const monitor = createMainLoopStallMonitor({
      ...h.deps,
      ipc: { ...timing, attachAll: () => timing.attach(session) }
    })
    monitor.setEnabled(true)

    session.emit('-ipc-invoke', {}, 'pty:resize', [])
    session.emit('-ipc-invoke', {}, 'git:status', [])
    h.clock.mono += 100
    monitor.tick()
    h.clock.mono += 100
    monitor.tick()

    expect(h.write).toHaveBeenCalledWith(
      MAIN_LOOP_STALL_TOPIC,
      expect.objectContaining({ ipc: 'git:status', ipcMs: 640, ipcCount: 2 })
    )
  })
})

describe('IPC dispatch timing', () => {
  it('attaches once per emitter and detaches every listener', () => {
    const timing = createIpcDispatchTiming(() => 0)
    const session = new EventEmitter()

    timing.attach(session)
    timing.attach(session)
    for (const name of IPC_DISPATCH_EVENTS) {
      expect(session.listenerCount(name)).toBe(2)
    }

    timing.detachAll()
    for (const name of IPC_DISPATCH_EVENTS) {
      expect(session.listenerCount(name)).toBe(0)
    }
  })

  it('resets the window on take', () => {
    let now = 0
    const timing = createIpcDispatchTiming(() => now)
    const session = new EventEmitter()
    session.on('-ipc-message', () => {
      now += 30
    })
    timing.attach(session)

    session.emit('-ipc-message', {}, 'pty:write', [])

    expect(timing.take()).toEqual({ channel: 'pty:write', ms: 30, count: 1 })
    expect(timing.take()).toBeNull()
  })
})

// Opt-in main event-loop stall evidence for the troubleshooting log.
//
// Why: "the whole app froze" can be main's loop, the renderer's thread, or neither (GPU, the PTY
// daemon), and no existing signal says which on Windows — the hang watchdog is macOS-only with a
// 45s threshold. A late interval tick is the stall; the fields say what held it.

import { formatDiagnosticClockTime } from '../../shared/diagnostic-clock-time'
import type { IpcDispatchTiming, SlowestIpcDispatch } from './main-ipc-dispatch-timing'

export const MAIN_LOOP_SAMPLE_INTERVAL_MS = 100
export const MAIN_LOOP_STALL_THRESHOLD_MS = 200
export const MAIN_LOOP_STALL_TOPIC = 'freeze-main'

// Enough to cover one stall; GC pauses older than the last sample window are never read.
const MAX_GC_PAUSES = 32

export type MainLoopStallMonitorDeps = {
  /** Monotonic ms, same timebase as GC entry start times. */
  now: () => number
  wallNow: () => number
  /** CPU ms consumed so far; `thread` when the runtime can scope it to the main thread. */
  cpuMs: () => number
  cpuScope: 'thread' | 'process'
  setInterval: (callback: () => void, ms: number) => unknown
  clearInterval: (handle: unknown) => void
  write: (topic: string, fields: Record<string, unknown>) => void
  ipc?: IpcDispatchTiming & { attachAll: () => void }
  /** Starts GC pause observation; returns its disposer. */
  observeGc?: (record: (startMs: number, durationMs: number) => void) => () => void
}

export type MainLoopStallMonitor = {
  setEnabled: (enabled: boolean) => void
  isArmed: () => boolean
  /** Exposed for tests; the interval drives it in production. */
  tick: () => void
}

type PendingStall = {
  wallStart: number
  monoStart: number
  monoEnd: number
  ms: number
  cpuMs: number
  ipc: SlowestIpcDispatch | null
}

export function createMainLoopStallMonitor(deps: MainLoopStallMonitorDeps): MainLoopStallMonitor {
  let timer: unknown = null
  let stopGc: (() => void) | null = null
  let lastTickAt = 0
  let lastCpuMs = 0
  let pending: PendingStall | null = null
  const gcPauses: { start: number; duration: number }[] = []

  const gcMsBetween = (from: number, to: number): number => {
    let total = 0
    for (const pause of gcPauses) {
      const overlap = Math.min(to, pause.start + pause.duration) - Math.max(from, pause.start)
      total += Math.max(0, overlap)
    }
    return total
  }

  const flushPending = (): void => {
    if (!pending) {
      return
    }
    const stall = pending
    pending = null
    deps.write(MAIN_LOOP_STALL_TOPIC, {
      start: formatDiagnosticClockTime(stall.wallStart),
      ms: Math.round(stall.ms),
      // Why CPU next to wall time: CPU ≈ ms means JS or native compute held the loop; CPU ≈ 0
      // means it sat blocked in a syscall (sync fs on an EDR-scanned disk, sync child process).
      cpuMs: Math.round(stall.cpuMs),
      cpu: deps.cpuScope,
      gcMs: deps.observeGc ? Math.round(gcMsBetween(stall.monoStart, stall.monoEnd)) : undefined,
      ipc: stall.ipc?.channel,
      ipcMs: stall.ipc ? Math.round(stall.ipc.ms) : undefined,
      ipcCount: stall.ipc?.count
    })
  }

  const tick = (): void => {
    // Why report one tick late: GC observer entries are delivered asynchronously after the pause.
    flushPending()
    const now = deps.now()
    const cpuMs = deps.cpuMs()
    const ipc = deps.ipc?.take() ?? null
    const blockedMs = now - lastTickAt - MAIN_LOOP_SAMPLE_INTERVAL_MS
    if (blockedMs >= MAIN_LOOP_STALL_THRESHOLD_MS) {
      pending = {
        wallStart: deps.wallNow() - blockedMs,
        monoStart: lastTickAt,
        monoEnd: now,
        ms: blockedMs,
        cpuMs: cpuMs - lastCpuMs,
        ipc
      }
    }
    lastTickAt = now
    lastCpuMs = cpuMs
  }

  const arm = (): void => {
    lastTickAt = deps.now()
    lastCpuMs = deps.cpuMs()
    deps.ipc?.attachAll()
    stopGc =
      deps.observeGc?.((start, duration) => {
        gcPauses.push({ start, duration })
        if (gcPauses.length > MAX_GC_PAUSES) {
          gcPauses.shift()
        }
      }) ?? null
    timer = deps.setInterval(tick, MAIN_LOOP_SAMPLE_INTERVAL_MS)
  }

  const disarm = (): void => {
    deps.clearInterval(timer)
    timer = null
    // Why drop, not flush: the setting is already off when this runs, so the write gate would discard it.
    pending = null
    stopGc?.()
    stopGc = null
    gcPauses.length = 0
    deps.ipc?.detachAll()
  }

  return {
    setEnabled: (enabled) => {
      if (enabled && timer === null) {
        arm()
      } else if (!enabled && timer !== null) {
        disarm()
      }
    },
    isArmed: () => timer !== null,
    tick
  }
}

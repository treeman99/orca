// Electron wiring for the main-loop stall monitor. Kept apart so the monitor's logic tests
// without an Electron mock.

import { app, session, webContents } from 'electron'
import { performance, PerformanceObserver } from 'node:perf_hooks'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { isDiagnosticLogEnabled, writeDiagnosticLine } from './diagnostic-log'
import { createIpcDispatchTiming, type IpcDispatchEmitter } from './main-ipc-dispatch-timing'
import { createMainLoopStallMonitor, type MainLoopStallMonitor } from './main-loop-stall-monitor'

type SettingsStore = {
  getSettings: () => GlobalSettings
  onSettingsChanged: (
    listener: (updates: Partial<GlobalSettings>, settings: GlobalSettings) => void
  ) => () => void
}

let monitor: MainLoopStallMonitor | null = null

function readCpuMs(): { read: () => number; scope: 'thread' | 'process' } {
  const toMs = (usage: NodeJS.CpuUsage): number => (usage.user + usage.system) / 1000
  if (typeof process.threadCpuUsage === 'function') {
    return { read: () => toMs(process.threadCpuUsage()), scope: 'thread' }
  }
  return { read: () => toMs(process.cpuUsage()), scope: 'process' }
}

function listDispatchEmitters(): IpcDispatchEmitter[] {
  const sessions = new Set<unknown>([session.defaultSession])
  for (const contents of webContents.getAllWebContents()) {
    sessions.add(contents.session)
  }
  return [...sessions].filter(Boolean) as unknown as IpcDispatchEmitter[]
}

function observeGcPauses(record: (startMs: number, durationMs: number) => void): () => void {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      record(entry.startTime, entry.duration)
    }
  })
  observer.observe({ entryTypes: ['gc'] })
  return () => observer.disconnect()
}

/** Idempotent: core handlers can register more than once per process. */
export function installMainLoopStallMonitor(store: SettingsStore): void {
  if (monitor) {
    return
  }
  try {
    const cpu = readCpuMs()
    const timing = createIpcDispatchTiming(() => performance.now())
    const created = createMainLoopStallMonitor({
      now: () => performance.now(),
      wallNow: () => Date.now(),
      cpuMs: cpu.read,
      cpuScope: cpu.scope,
      setInterval: (callback, ms) => setInterval(callback, ms),
      clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
      write: writeDiagnosticLine,
      ipc: { ...timing, attachAll: () => listDispatchEmitters().forEach(timing.attach) },
      observeGc: observeGcPauses
    })
    monitor = created
    // Why: a window opened while armed may bring a partition session the arm-time walk missed.
    app.on('web-contents-created', (_event, contents) => {
      if (created.isArmed()) {
        timing.attach(contents.session as unknown as IpcDispatchEmitter)
      }
    })
    // Why the change listener and not a poll: while the log is off nothing may tick at all.
    store.onSettingsChanged((_updates, settings) => {
      created.setEnabled(isDiagnosticLogEnabled(settings))
    })
    created.setEnabled(isDiagnosticLogEnabled(store.getSettings()))
  } catch (error) {
    console.warn('[diagnostic-log] main loop stall monitor unavailable:', error)
  }
}

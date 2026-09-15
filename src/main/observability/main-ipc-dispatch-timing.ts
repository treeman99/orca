// Times the synchronous part of each renderer→main IPC dispatch, so a main-loop stall line can
// name the handler that held the loop.
//
// Why Electron's internal `-ipc-*` events: there is no public hook around `ipcMain.handle`, and
// wrapping every registrar is invasive. Electron 43 emits these on each Session and runs the
// handler synchronously inside its own listener, so a prepended listener marks the start and an
// appended one the end. Best-effort only — if a later Electron renames them the field goes empty.

export const IPC_DISPATCH_EVENTS = ['-ipc-invoke', '-ipc-message', '-ipc-message-sync'] as const

type DispatchListener = (...args: unknown[]) => void

export type IpcDispatchEmitter = {
  prependListener: (event: string, listener: DispatchListener) => unknown
  on: (event: string, listener: DispatchListener) => unknown
  removeListener: (event: string, listener: DispatchListener) => unknown
}

export type SlowestIpcDispatch = { channel: string; ms: number; count: number }

export type IpcDispatchTiming = {
  attach: (emitter: IpcDispatchEmitter) => void
  detachAll: () => void
  /** The slowest dispatch since the previous call, then resets the window. */
  take: () => SlowestIpcDispatch | null
}

export function createIpcDispatchTiming(now: () => number): IpcDispatchTiming {
  const attached = new Map<IpcDispatchEmitter, () => void>()
  let current: { channel: string; startedAt: number } | null = null
  let slowest: { channel: string; ms: number } | null = null
  let count = 0

  // Why try/catch in both: a prepended listener that throws would break Electron's IPC dispatch.
  const onStart: DispatchListener = (_event, channel) => {
    try {
      current = { channel: typeof channel === 'string' ? channel : '?', startedAt: now() }
    } catch {
      current = null
    }
  }
  const onEnd: DispatchListener = () => {
    try {
      if (!current) {
        return
      }
      const ms = now() - current.startedAt
      count += 1
      if (!slowest || ms > slowest.ms) {
        slowest = { channel: current.channel, ms }
      }
      current = null
    } catch {
      current = null
    }
  }

  return {
    attach: (emitter) => {
      if (attached.has(emitter)) {
        return
      }
      for (const name of IPC_DISPATCH_EVENTS) {
        emitter.prependListener(name, onStart)
        emitter.on(name, onEnd)
      }
      attached.set(emitter, () => {
        for (const name of IPC_DISPATCH_EVENTS) {
          emitter.removeListener(name, onStart)
          emitter.removeListener(name, onEnd)
        }
      })
    },
    detachAll: () => {
      for (const detach of attached.values()) {
        detach()
      }
      attached.clear()
      current = null
      slowest = null
      count = 0
    },
    take: () => {
      const result = slowest ? { ...slowest, count } : null
      slowest = null
      count = 0
      return result
    }
  }
}

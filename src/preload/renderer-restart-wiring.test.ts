import { describe, expect, it, vi } from 'vitest'
import { ORCA_RENDERER_UNLOAD_PREVENTED_EVENT } from '../shared/renderer-shutdown-events'
import { ORCA_APP_RESTART_ABORTED_EVENT } from '../shared/app-restart-renderer-events'
import {
  prepareAndInvokeAppRestart,
  registerRendererRestartIpcRelays
} from './renderer-restart-wiring'

describe('renderer restart wiring', () => {
  it('relays prevented unload events', () => {
    const eventTarget = new EventTarget()
    const unloadPrevented = vi.fn()
    const restartAborted = vi.fn()
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const ipcRenderer = {
      on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
        listeners.set(channel, listener)
        return ipcRenderer
      })
    } as unknown as Parameters<typeof registerRendererRestartIpcRelays>[0]
    eventTarget.addEventListener(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT, unloadPrevented)
    eventTarget.addEventListener(ORCA_APP_RESTART_ABORTED_EVENT, restartAborted)

    registerRendererRestartIpcRelays(ipcRenderer, eventTarget)
    listeners.get('window:unload-prevented')?.({})

    expect(ipcRenderer.on).toHaveBeenCalledTimes(1)
    expect(unloadPrevented).toHaveBeenCalledTimes(1)
    expect(restartAborted).toHaveBeenCalledTimes(1)
  })

  // Fork guard: the updater install relay is gone; nothing may re-register it.
  it('registers no updater status relay', () => {
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const ipcRenderer = {
      on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
        listeners.set(channel, listener)
        return ipcRenderer
      })
    } as unknown as Parameters<typeof registerRendererRestartIpcRelays>[0]

    registerRendererRestartIpcRelays(ipcRenderer, new EventTarget())

    expect(listeners.has('updater:status')).toBe(false)
    expect(listeners.has('updater:quitAndInstallAborted')).toBe(false)
  })

  it('aborts the restart when main rejects the invoke', async () => {
    const eventTarget = new EventTarget()
    const calls: string[] = []
    eventTarget.addEventListener(ORCA_APP_RESTART_ABORTED_EVENT, () => calls.push('aborted'))
    const invoke = vi.fn(async () => {
      calls.push('invoked')
      throw new Error('IPC failed')
    })

    await expect(
      prepareAndInvokeAppRestart(eventTarget, invoke, async () => {
        calls.push('checkpoint-flushed')
      })
    ).rejects.toThrow('IPC failed')

    expect(calls).toEqual(['checkpoint-flushed', 'invoked', 'aborted'])
  })

  it('never restarts when the shutdown checkpoint fails to persist', async () => {
    const invoke = vi.fn(() => Promise.resolve())

    await expect(
      prepareAndInvokeAppRestart(new EventTarget(), invoke, () =>
        Promise.reject(new Error('Failed to persist renderer state before unload.'))
      )
    ).rejects.toThrow('Failed to persist renderer state before unload.')

    expect(invoke).not.toHaveBeenCalled()
  })
})

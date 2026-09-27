import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { ORCA_RENDERER_UNLOAD_PREVENTED_EVENT } from '../shared/renderer-shutdown-events'
import {
  ORCA_APP_RESTART_ABORTED_EVENT,
  ORCA_APP_RESTART_STARTED_EVENT
} from '../shared/app-restart-renderer-events'
import {
  prepareAndInvokeAppRestart,
  registerRendererRestartIpcRelays
} from './renderer-restart-wiring'

function restartIpc(eventTarget: EventTarget) {
  const ipcRenderer = Object.assign(new EventEmitter(), {
    invoke: vi.fn(async () => {}),
    postMessage: vi.fn(),
    send: vi.fn(),
    sendSync: vi.fn(),
    sendToHost: vi.fn()
  })
  registerRendererRestartIpcRelays(ipcRenderer, eventTarget)
  return { ipcRenderer }
}

describe('renderer restart wiring', () => {
  it.each(['no-op', 'failure'] as const)(
    'keeps a committed restart prepared after a later %s',
    async (outcome) => {
      const eventTarget = new EventTarget()
      const { ipcRenderer } = restartIpc(eventTarget)
      const aborted = vi.fn()
      const started = vi.fn()
      const checkpoint = vi.fn(async () => {})
      eventTarget.addEventListener(ORCA_APP_RESTART_ABORTED_EVENT, aborted)
      eventTarget.addEventListener(ORCA_APP_RESTART_STARTED_EVENT, started)
      await prepareAndInvokeAppRestart(
        eventTarget,
        async () => {
          ipcRenderer.emit('app:restart-committed')
          return true
        },
        checkpoint,
        Boolean
      )
      const subsequent = prepareAndInvokeAppRestart(
        eventTarget,
        async () => {
          if (outcome === 'failure') {
            throw new Error('already finalized')
          }
          return false
        },
        checkpoint,
        Boolean
      )
      await (outcome === 'failure'
        ? expect(subsequent).rejects.toThrow('already finalized')
        : expect(subsequent).resolves.toBe(false))
      expect(checkpoint).toHaveBeenCalledOnce()
      expect(started).toHaveBeenCalledOnce()
      expect(aborted).not.toHaveBeenCalled()
    }
  )

  it('refuses overlapping preparation without abandoning the accepted restart', async () => {
    const eventTarget = new EventTarget()
    const aborted = vi.fn()
    eventTarget.addEventListener(ORCA_APP_RESTART_ABORTED_EVENT, aborted)
    const checkpoint = Promise.withResolvers<void>()
    const invoke = vi.fn(async () => true)
    const first = prepareAndInvokeAppRestart(eventTarget, invoke, () => checkpoint.promise)
    const refused = vi.fn(async () => false)
    await expect(
      prepareAndInvokeAppRestart(eventTarget, refused, async () => {}, Boolean)
    ).rejects.toThrow('already in progress')
    expect(refused).not.toHaveBeenCalled()
    expect(aborted).not.toHaveBeenCalled()
    checkpoint.resolve()
    await expect(first).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('retains late commitment across an unrelated unload veto', async () => {
    const eventTarget = new EventTarget()
    const abandoned = vi.fn()
    eventTarget.addEventListener(ORCA_APP_RESTART_ABORTED_EVENT, abandoned)
    eventTarget.addEventListener(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT, abandoned)
    const { ipcRenderer } = restartIpc(eventTarget)
    const checkpoint = vi.fn(async () => {})
    await prepareAndInvokeAppRestart(eventTarget, async () => true, checkpoint, Boolean)
    ipcRenderer.emit('app:restart-committed')
    await prepareAndInvokeAppRestart(eventTarget, async () => false, checkpoint, Boolean)
    expect(checkpoint).toHaveBeenCalledOnce()
    ipcRenderer.emit('window:unload-prevented')
    await prepareAndInvokeAppRestart(eventTarget, async () => true, checkpoint, Boolean)
    expect(checkpoint).toHaveBeenCalledOnce()
    expect(abandoned).not.toHaveBeenCalled()
  })

  it('releases preparation ownership and its listener after checkpoint failure', async () => {
    const eventTarget = new EventTarget()
    const add = vi.spyOn(eventTarget, 'addEventListener')
    const remove = vi.spyOn(eventTarget, 'removeEventListener')
    await expect(
      prepareAndInvokeAppRestart(
        eventTarget,
        async () => {},
        async () => {
          throw new Error('checkpoint failed')
        }
      )
    ).rejects.toThrow('checkpoint failed')
    await prepareAndInvokeAppRestart(
      eventTarget,
      async () => {},
      async () => {}
    )
    expect(add.mock.calls).toHaveLength(2)
    expect(remove.mock.calls).toEqual(add.mock.calls)
  })

  // Fork: no in-app updater, so only the restart-commit and unload-veto relays exist.
  it('relays prevented unload events', () => {
    const eventTarget = new EventTarget()
    const unloadPrevented = vi.fn()
    const restartAborted = vi.fn()
    const { ipcRenderer } = restartIpc(eventTarget)
    eventTarget.addEventListener(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT, unloadPrevented)
    eventTarget.addEventListener(ORCA_APP_RESTART_ABORTED_EVENT, restartAborted)
    ipcRenderer.emit('window:unload-prevented')

    expect(ipcRenderer.eventNames()).toHaveLength(2)
    expect(unloadPrevented).toHaveBeenCalledTimes(1)
    expect(restartAborted).toHaveBeenCalledTimes(1)
  })

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

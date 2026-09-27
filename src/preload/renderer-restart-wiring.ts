import type { IpcRenderer } from 'electron'
import { ORCA_RENDERER_UNLOAD_PREVENTED_EVENT } from '../shared/renderer-shutdown-events'
import { prepareRendererForAppRestart } from '../shared/renderer-restart-preparation'
import {
  ORCA_APP_RESTART_ABORTED_EVENT,
  ORCA_APP_RESTART_STARTED_EVENT
} from '../shared/app-restart-renderer-events'

type AppRestartState = { committed: boolean; pending: boolean }
const appRestartStates = new WeakMap<EventTarget, AppRestartState>()

function appRestartState(eventTarget: EventTarget): AppRestartState {
  let state = appRestartStates.get(eventTarget)
  if (!state) {
    state = { committed: false, pending: false }
    appRestartStates.set(eventTarget, state)
  }
  return state
}

export function registerRendererRestartIpcRelays(
  ipcRenderer: Pick<IpcRenderer, 'on'>,
  eventTarget: EventTarget
): void {
  ipcRenderer.on('app:restart-committed', () => {
    appRestartState(eventTarget).committed = true
  })
  ipcRenderer.on('window:unload-prevented', () => {
    // A quit veto cannot reopen a profile whose maintenance has already committed.
    if (appRestartState(eventTarget).committed) {
      return
    }
    eventTarget.dispatchEvent(new Event(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT))
    eventTarget.dispatchEvent(new Event(ORCA_APP_RESTART_ABORTED_EVENT))
  })
}

export async function prepareAndInvokeAppRestart<T>(
  eventTarget: EventTarget,
  invoke: () => Promise<T>,
  awaitCheckpoint: () => Promise<void>,
  willRestart: (result: T) => boolean = () => true
): Promise<T> {
  const state = appRestartState(eventTarget)
  if (state.pending) {
    throw new Error('App restart preparation is already in progress')
  }
  state.pending = true
  try {
    if (!state.committed) {
      await prepareRendererForAppRestart(eventTarget, {
        startedEventName: ORCA_APP_RESTART_STARTED_EVENT,
        abortedEventName: ORCA_APP_RESTART_ABORTED_EVENT,
        awaitCheckpoint
      })
    }
    try {
      const result = await invoke()
      if (!state.committed && !willRestart(result)) {
        eventTarget.dispatchEvent(new Event(ORCA_APP_RESTART_ABORTED_EVENT))
      }
      return result
    } catch (error) {
      // A failed profile move can require recovery after its writer has already closed.
      if (!state.committed) {
        eventTarget.dispatchEvent(new Event(ORCA_APP_RESTART_ABORTED_EVENT))
      }
      throw error
    }
  } finally {
    state.pending = false
  }
}

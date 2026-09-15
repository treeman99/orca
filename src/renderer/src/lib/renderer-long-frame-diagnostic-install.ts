// Binds the long-frame diagnostic to the app store's log setting and the preload log bridge.
import { useAppStore } from '@/store'
import {
  startRendererLongFrameDiagnostic,
  type LongFrameEntry
} from './renderer-long-frame-diagnostic'

let dispose: (() => void) | null = null

export function installRendererLongFrameDiagnostic(): void {
  const write = window.api?.diagnosticLog?.write
  if (dispose || typeof PerformanceObserver !== 'function' || typeof write !== 'function') {
    return
  }
  const isEnabled = (): boolean => useAppStore.getState().settings?.diagnosticLogEnabled === true
  try {
    dispose = startRendererLongFrameDiagnostic({
      supportedEntryTypes: PerformanceObserver.supportedEntryTypes ?? [],
      observe: (type, onEntries) => {
        const observer = new PerformanceObserver((list) => {
          onEntries(list.getEntries() as unknown as LongFrameEntry[])
        })
        observer.observe({ type, buffered: false })
        return observer
      },
      isEnabled,
      // Why a boolean compare per store update: cheaper than any poll, and the observer itself
      // is only connected while the log is on.
      subscribeEnabled: (listener) => {
        let last = isEnabled()
        return useAppStore.subscribe(() => {
          const next = isEnabled()
          if (next !== last) {
            last = next
            listener()
          }
        })
      },
      write: (topic, fields) => {
        void write(topic, fields).catch(() => {})
      },
      wallNow: () => Date.now(),
      perfNow: () => performance.now(),
      isHidden: () => document.visibilityState === 'hidden'
    })
  } catch {
    // A troubleshooting aid must never break renderer boot.
  }
}

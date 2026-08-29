import { useAppStore } from '@/store'

/**
 * Main owns the detached-tab windows, so it is the source of truth for which tabs
 * this window must hide.
 */
export function registerTabPopoutIpcBridge(unsubs: (() => void)[]): void {
  if (!window.api.tabPopout?.onChanged || !window.api.tabPopout.onActivateTab) {
    return
  }
  unsubs.push(
    window.api.tabPopout.onChanged((snapshot) => {
      useAppStore.getState().setTabPopoutSnapshot(snapshot)
    })
  )
  unsubs.push(
    window.api.tabPopout.onActivateTab((tabId) => {
      useAppStore.getState().activateTab(tabId)
    })
  )
  // Recover the set after a renderer reload, which leaves the windows open.
  void Promise.resolve(window.api.tabPopout.snapshot?.())
    .then((snapshot) => {
      if (snapshot) {
        useAppStore.getState().setTabPopoutSnapshot(snapshot)
      }
    })
    .catch(() => undefined)
}

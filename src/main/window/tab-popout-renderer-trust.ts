import type { WebContents } from 'electron'

// Why: this predicate is imported by IPC gates (clipboard, ui, terminal-preview)
// that must stay free of a runtime `electron` import — mirrors browser-renderer-trust.
const tabPopoutWebContentsIds = new Set<number>()

export function registerTabPopoutWebContents(webContentsId: number): void {
  tabPopoutWebContentsIds.add(webContentsId)
}

export function unregisterTabPopoutWebContents(webContentsId: number): void {
  tabPopoutWebContentsIds.delete(webContentsId)
}

/** True when the sender is a live detached-tab window. */
export function isTabPopoutRenderer(sender: WebContents): boolean {
  // Why: check the registry first so the common "no tabs detached" case costs one
  // Set lookup and never touches the sender.
  if (!tabPopoutWebContentsIds.has(sender.id)) {
    return false
  }
  return !sender.isDestroyed() && sender.getType() === 'window'
}

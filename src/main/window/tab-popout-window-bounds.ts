import type { BrowserWindow } from 'electron'
import type { Store } from '../persistence'
import { rectHasVisibleAreaOnAnyDisplay } from './window-bounds-validation'

export const TAB_POPOUT_MIN_WIDTH = 480
export const TAB_POPOUT_MIN_HEIGHT = 320
export const TAB_POPOUT_DEFAULT_WIDTH = 900
export const TAB_POPOUT_DEFAULT_HEIGHT = 640

const CASCADE_STEP = 28
const SAVE_DEBOUNCE_MS = 500

type Bounds = { x: number; y: number; width: number; height: number }

/**
 * Bounds for the next detached-tab window. One persisted slot is shared by every
 * pop-out; `cascadeIndex` offsets each additional open window so a second detach
 * never lands exactly on top of the first.
 */
export function resolveTabPopoutBounds(store: Store | null, cascadeIndex: number): Bounds | null {
  const raw = store?.getUI().tabPopoutBounds ?? null
  if (
    !raw ||
    raw.width < TAB_POPOUT_MIN_WIDTH ||
    raw.height < TAB_POPOUT_MIN_HEIGHT ||
    !rectHasVisibleAreaOnAnyDisplay(raw, TAB_POPOUT_MIN_WIDTH / 2, TAB_POPOUT_MIN_HEIGHT / 2)
  ) {
    return null
  }
  if (cascadeIndex <= 0) {
    return raw
  }
  const offset = CASCADE_STEP * cascadeIndex
  const cascaded = { ...raw, x: raw.x + offset, y: raw.y + offset }
  // Why: cascading can walk a window off the desktop; fall back to the un-offset slot.
  return rectHasVisibleAreaOnAnyDisplay(
    cascaded,
    TAB_POPOUT_MIN_WIDTH / 2,
    TAB_POPOUT_MIN_HEIGHT / 2
  )
    ? cascaded
    : raw
}

/**
 * Debounced bounds persistence, frozen on close/quit so teardown-time resize
 * events cannot overwrite the remembered size with near-minimum bounds.
 */
export function installTabPopoutBoundsPersistence(
  window: BrowserWindow,
  store: Store | null
): { freeze: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let closing = false

  const save = (): void => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      if (closing || window.isDestroyed() || window.isMinimized() || window.isFullScreen()) {
        return
      }
      const bounds = window.getBounds()
      if (bounds.width < TAB_POPOUT_MIN_WIDTH || bounds.height < TAB_POPOUT_MIN_HEIGHT) {
        return
      }
      store?.updateUI({ tabPopoutBounds: bounds })
    }, SAVE_DEBOUNCE_MS)
  }

  window.on('resize', save)
  window.on('move', save)

  return {
    freeze: (): void => {
      closing = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }
  }
}

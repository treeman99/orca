import type { Terminal } from '@xterm/xterm'
import { subscribeToTerminalUserInput } from './terminal-user-input-signal'

// Why this exists: xterm's user-input signal is "did a person cause these bytes", not "did a
// person type". Mouse-tracking reports and the arrow keys it synthesizes for a wheel over an
// alternate-screen TUI both carry the flag, so one scroll over a freshly split worker pane
// handed the dispatch to the user (`user_takeover`) with no keystroke. Takeover must mean typed,
// pasted, or composed input; pointer gestures still count as activity for hibernation.

// SGR (1006/1016) `ESC[<b;x;yM|m`, urxvt (1015) `ESC[b;x;yM`, X10/normal `ESC[M` + 3 bytes.
// eslint-disable-next-line no-control-regex -- ESC is the byte being matched
const MOUSE_REPORT_BURST = /^(?:\x1b\[<\d+;\d+;\d+[Mm]|\x1b\[\d+;\d+;\d+M|\x1b\[M[\s\S]{3})+$/

export function isXtermMouseReportSequence(data: string): boolean {
  return data.length > 0 && MOUSE_REPORT_BURST.test(data)
}

/**
 * Marks the synchronous window of a wheel or touch-scroll dispatch. xterm turns those into
 * `ESC[A`/`ESC[B` bursts on an alternate screen without mouse tracking — bytes identical to
 * arrow keys — so only the gesture itself can tell them apart. The flag clears on a macrotask,
 * not a microtask: the browser drains microtasks between listeners, and xterm's own wheel
 * listener runs after ours.
 */
export function createTerminalWheelGestureTracker(element: HTMLElement | null | undefined): {
  isActive: () => boolean
  dispose: () => void
} {
  let active = false
  let clearTimer: ReturnType<typeof setTimeout> | null = null
  const onGesture = (): void => {
    active = true
    if (clearTimer === null) {
      clearTimer = setTimeout(() => {
        clearTimer = null
        active = false
      }, 0)
    }
  }
  const options: AddEventListenerOptions = { capture: true, passive: true }
  // xterm exposes `element` before it is a real DOM node in some harnesses; no node, no gesture.
  const target = typeof element?.addEventListener === 'function' ? element : null
  target?.addEventListener('wheel', onGesture, options)
  target?.addEventListener('touchmove', onGesture, options)
  return {
    isActive: () => active,
    dispose: () => {
      target?.removeEventListener('wheel', onGesture, options)
      target?.removeEventListener('touchmove', onGesture, options)
      if (clearTimer !== null) {
        clearTimeout(clearTimer)
        clearTimer = null
      }
      active = false
    }
  }
}

/**
 * `onUserInput` fires for every real input (the old signal, unchanged); `onTypedInput` only for
 * input that is not a pointer gesture. Returns null when xterm's core signal is unavailable so
 * the caller keeps its onData fallback, exactly like `subscribeToTerminalUserInput`.
 */
export function subscribeToTerminalTypedUserInput(
  terminal: Terminal,
  listeners: { onUserInput: () => void; onTypedInput: () => void }
): { dispose: () => void } | null {
  let pendingUserInput = false
  const userInput = subscribeToTerminalUserInput(terminal, () => {
    pendingUserInput = true
  })
  if (!userInput) {
    return null
  }
  const wheelGesture = createTerminalWheelGestureTracker(terminal.element)
  // Why onData and not the signal alone: the signal carries no bytes, and CoreService fires it
  // synchronously right before onData for the same input, so the flag pairs them exactly.
  const data = terminal.onData((bytes) => {
    if (!pendingUserInput) {
      return
    }
    pendingUserInput = false
    listeners.onUserInput()
    if (wheelGesture.isActive() || isXtermMouseReportSequence(bytes)) {
      return
    }
    listeners.onTypedInput()
  })
  return {
    dispose: () => {
      data.dispose()
      userInput.dispose()
      wheelGesture.dispose()
    }
  }
}

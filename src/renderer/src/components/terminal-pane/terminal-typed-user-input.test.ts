// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { Terminal } from '@xterm/xterm'
import {
  createTerminalWheelGestureTracker,
  isXtermMouseReportSequence,
  subscribeToTerminalTypedUserInput
} from './terminal-typed-user-input'

type CoreServiceAccess = {
  _core: { coreService: { triggerDataEvent: (data: string, wasUserInput?: boolean) => void } }
}

const SGR_WHEEL_UP = '\x1b[<64;12;5M'
const SGR_PRESS = '\x1b[<0;3;4M'
const SGR_RELEASE = '\x1b[<0;3;4m'
const URXVT_PRESS = '\x1b[32;3;4M'
const X10_PRESS = '\x1b[M !!'

describe('isXtermMouseReportSequence', () => {
  it('recognizes every mouse-tracking encoding, alone or in a burst', () => {
    for (const report of [SGR_WHEEL_UP, SGR_PRESS, SGR_RELEASE, URXVT_PRESS, X10_PRESS]) {
      expect(isXtermMouseReportSequence(report), JSON.stringify(report)).toBe(true)
    }
    expect(isXtermMouseReportSequence(SGR_WHEEL_UP + SGR_WHEEL_UP)).toBe(true)
  })

  it('leaves typed, pasted, and composed input alone', () => {
    for (const typed of [
      'a',
      '한',
      '\r',
      '\x1b[A',
      '\x1bOB',
      '\x1b[200~hello\x1b[201~',
      '',
      '\x1b'
    ]) {
      expect(isXtermMouseReportSequence(typed), JSON.stringify(typed)).toBe(false)
    }
    // A report followed by a keystroke is not a pure gesture.
    expect(isXtermMouseReportSequence(`${SGR_PRESS}a`)).toBe(false)
  })
})

describe('createTerminalWheelGestureTracker', () => {
  it('is active for listeners that run after ours in the same wheel dispatch, then clears', async () => {
    const element = document.createElement('div')
    const tracker = createTerminalWheelGestureTracker(element)
    const seen: boolean[] = []
    // Bubble phase: the position xterm's own wheel handler occupies.
    element.addEventListener('wheel', () => seen.push(tracker.isActive()))
    expect(tracker.isActive()).toBe(false)
    element.dispatchEvent(new Event('wheel', { bubbles: true }))
    expect(seen).toEqual([true])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(tracker.isActive()).toBe(false)
    tracker.dispose()
    element.dispatchEvent(new Event('wheel', { bubbles: true }))
    expect(seen).toEqual([true, false])
  })

  it('tolerates a terminal that has no element yet', () => {
    const tracker = createTerminalWheelGestureTracker(null)
    expect(tracker.isActive()).toBe(false)
    tracker.dispose()
  })
})

// Runs against the real vendored @xterm/xterm on purpose, like terminal-user-input-signal.test.ts:
// the pairing of onUserInput with the next onData is a core-internal contract.
describe('subscribeToTerminalTypedUserInput', () => {
  function subscribe() {
    const terminal = new Terminal({ allowProposedApi: true })
    const onUserInput = vi.fn()
    const onTypedInput = vi.fn()
    const subscription = subscribeToTerminalTypedUserInput(terminal, { onUserInput, onTypedInput })
    const coreService = (terminal as unknown as CoreServiceAccess)._core.coreService
    return { terminal, onUserInput, onTypedInput, subscription, coreService }
  }

  it('reports typed input as both activity and takeover', () => {
    const { terminal, onUserInput, onTypedInput, subscription, coreService } = subscribe()
    expect(subscription).not.toBeNull()
    coreService.triggerDataEvent('a', true)
    coreService.triggerDataEvent('\x1b[200~pasted\x1b[201~', true)
    expect(onUserInput).toHaveBeenCalledTimes(2)
    expect(onTypedInput).toHaveBeenCalledTimes(2)
    subscription?.dispose()
    terminal.dispose()
  })

  it('counts a mouse report as activity but never as takeover', () => {
    const { terminal, onUserInput, onTypedInput, subscription, coreService } = subscribe()
    coreService.triggerDataEvent(SGR_WHEEL_UP, true)
    coreService.triggerDataEvent(SGR_PRESS, true)
    coreService.triggerDataEvent(SGR_RELEASE, true)
    expect(onUserInput).toHaveBeenCalledTimes(3)
    expect(onTypedInput).not.toHaveBeenCalled()
    // The next real keystroke still takes over: the mouse path must not latch the flag.
    coreService.triggerDataEvent('b', true)
    expect(onTypedInput).toHaveBeenCalledTimes(1)
    subscription?.dispose()
    terminal.dispose()
  })

  it('ignores parser auto-replies entirely', () => {
    const { terminal, onUserInput, onTypedInput, subscription, coreService } = subscribe()
    coreService.triggerDataEvent('\x1b[I', false)
    coreService.triggerDataEvent('\x1b[?1;2c')
    expect(onUserInput).not.toHaveBeenCalled()
    expect(onTypedInput).not.toHaveBeenCalled()
    subscription?.dispose()
    terminal.dispose()
  })

  it('returns null when the core signal is unavailable, so callers keep their onData fallback', () => {
    const terminal = { _core: { coreService: {} }, onData: vi.fn(), element: null } as never
    expect(
      subscribeToTerminalTypedUserInput(terminal, { onUserInput: vi.fn(), onTypedInput: vi.fn() })
    ).toBeNull()
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  describeLongFrameEntry,
  RENDERER_LONG_FRAME_TOPIC,
  startRendererLongFrameDiagnostic,
  type LongFrameEntry,
  type RendererLongFrameDiagnosticDeps
} from './renderer-long-frame-diagnostic'

const WALL_BASE = new Date(2026, 8, 15, 10, 0, 0, 0).getTime()
// perfNow 5000 at wall 10:00:05.000, so startTime 2000 is 10:00:02.000.
const ANCHOR = { wallNow: WALL_BASE + 5_000, perfNow: 5_000 }

function loaf(overrides: Partial<LongFrameEntry> = {}): LongFrameEntry {
  return {
    entryType: 'long-animation-frame',
    startTime: 2_000,
    duration: 900,
    blockingDuration: 850,
    renderStart: 2_820,
    scripts: [
      { duration: 40, invoker: 'TimerHandler:setTimeout', invokerType: 'user-callback' },
      {
        duration: 700,
        invoker: 'Window.onkeydown',
        invokerType: 'event-listener',
        sourceURL:
          'file:///C:/Users/someone/AppData/Local/Orca/resources/app.asar/out/renderer/assets/index-abc.js?v=1',
        sourceFunctionName: 'Qe',
        sourceCharPosition: 12345,
        forcedStyleAndLayoutDuration: 120
      }
    ],
    ...overrides
  }
}

describe('describeLongFrameEntry', () => {
  it('ignores frames under the threshold', () => {
    expect(describeLongFrameEntry(loaf({ duration: 199 }), ANCHOR, false)).toBeNull()
  })

  it('attributes a long animation frame to its slowest script on the shared clock', () => {
    const fields = describeLongFrameEntry(loaf(), ANCHOR, false)

    expect(fields).toEqual({
      kind: 'loaf',
      start: '10:00:02.000',
      ms: 900,
      hidden: false,
      blockMs: 850,
      renderMs: 80,
      layoutMs: 120,
      scriptMs: 700,
      invoker: 'Window.onkeydown',
      via: 'event-listener',
      src: 'index-abc.js:12345',
      fn: 'Qe'
    })
    // Main's write handler keeps only the first twelve fields.
    expect(Object.keys(fields ?? {}).length).toBeLessThanOrEqual(12)
    expect(JSON.stringify(fields)).not.toContain('someone')
  })

  it('keeps a longtask fallback line to duration and container', () => {
    expect(
      describeLongFrameEntry(
        {
          entryType: 'longtask',
          startTime: 2_000,
          duration: 400,
          attribution: [{ containerType: 'window' }]
        },
        ANCHOR,
        true
      )
    ).toEqual({
      kind: 'longtask',
      start: '10:00:02.000',
      ms: 400,
      hidden: true,
      container: 'window'
    })
  })
})

function harness(supportedEntryTypes: string[] = ['long-animation-frame', 'longtask']) {
  let enabled = false
  const listeners = new Set<() => void>()
  const disconnect = vi.fn()
  let deliver: ((entries: readonly LongFrameEntry[]) => void) | null = null
  const observe = vi.fn(
    (_type: string, onEntries: (entries: readonly LongFrameEntry[]) => void) => {
      deliver = onEntries
      return { disconnect }
    }
  )
  const write = vi.fn()
  const deps: RendererLongFrameDiagnosticDeps = {
    supportedEntryTypes,
    observe,
    isEnabled: () => enabled,
    subscribeEnabled: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    write,
    wallNow: () => ANCHOR.wallNow,
    perfNow: () => ANCHOR.perfNow,
    isHidden: () => false
  }
  const setEnabled = (next: boolean): void => {
    enabled = next
    listeners.forEach((listener) => listener())
  }
  return {
    deps,
    observe,
    disconnect,
    write,
    setEnabled,
    deliver: (e: LongFrameEntry[]) => deliver?.(e)
  }
}

describe('startRendererLongFrameDiagnostic', () => {
  it('connects no observer while the log is off', () => {
    const h = harness()

    startRendererLongFrameDiagnostic(h.deps)

    expect(h.observe).not.toHaveBeenCalled()
  })

  it('observes long animation frames only while the log is on', () => {
    const h = harness()
    startRendererLongFrameDiagnostic(h.deps)

    h.setEnabled(true)
    expect(h.observe).toHaveBeenCalledWith('long-animation-frame', expect.any(Function))
    h.deliver([loaf(), loaf({ duration: 60 })])
    expect(h.write).toHaveBeenCalledTimes(1)
    expect(h.write).toHaveBeenCalledWith(
      RENDERER_LONG_FRAME_TOPIC,
      expect.objectContaining({ ms: 900 })
    )

    h.setEnabled(false)
    expect(h.disconnect).toHaveBeenCalledTimes(1)
  })

  it('falls back to longtask, and does nothing where neither entry type exists', () => {
    const fallback = harness(['longtask'])
    fallback.setEnabled(true)
    startRendererLongFrameDiagnostic(fallback.deps)
    expect(fallback.observe).toHaveBeenCalledWith('longtask', expect.any(Function))

    const none = harness([])
    none.setEnabled(true)
    startRendererLongFrameDiagnostic(none.deps)
    expect(none.observe).not.toHaveBeenCalled()
  })

  it('disposes its observer and subscription', () => {
    const h = harness()
    const dispose = startRendererLongFrameDiagnostic(h.deps)
    h.setEnabled(true)

    dispose()
    h.setEnabled(false)
    h.setEnabled(true)

    expect(h.disconnect).toHaveBeenCalledTimes(1)
    expect(h.observe).toHaveBeenCalledTimes(1)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

import { logTerminalRestoreDiagnostic } from './terminal-restore-diagnostics'

type DiagnosticWrite = (
  topic: string,
  fields?: Record<string, string | number | boolean>
) => Promise<boolean>

function installDiagnosticApi(write: DiagnosticWrite | undefined): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { api: write ? { diagnosticLog: { write } } : {} }
  })
}

function makeTerminal(overrides: {
  rows?: number
  cols?: number
  baseY?: number
  cursorY?: number
  cursorX?: number
  type?: 'normal' | 'alternate'
}) {
  return {
    rows: overrides.rows ?? 40,
    cols: overrides.cols ?? 120,
    buffer: {
      active: {
        baseY: overrides.baseY ?? 0,
        cursorY: overrides.cursorY ?? 0,
        cursorX: overrides.cursorX ?? 0,
        type: overrides.type ?? 'normal'
      }
    }
  } as never
}

describe('logTerminalRestoreDiagnostic', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('writes one terminal-restore line carrying the pane identity, grid, and cursor', () => {
    const write = vi.fn<DiagnosticWrite>(() => Promise.resolve(true))
    installDiagnosticApi(write)

    logTerminalRestoreDiagnostic('fresh-spawn-blank', {
      tabId: 'tab-1',
      ptyId: 'pty-1',
      terminal: makeTerminal({ baseY: 120, cursorY: 3, cursorX: 12, type: 'alternate' }),
      visible: true,
      nativeConpty: true,
      extra: { blanked: true, marker: false, skipped: undefined, reason: null }
    })

    expect(write).toHaveBeenCalledWith('terminal-restore', {
      event: 'fresh-spawn-blank',
      tab: 'tab-1',
      pty: 'pty-1',
      visible: true,
      conpty: true,
      grid: '120x40',
      baseY: 120,
      cursor: '3,12',
      alt: true,
      blanked: true,
      marker: false
    })
  })

  it('stays within the log bridge field cap for the widest caller', () => {
    const write = vi.fn<DiagnosticWrite>(() => Promise.resolve(true))
    installDiagnosticApi(write)

    logTerminalRestoreDiagnostic('snapshot-restore', {
      tabId: 'tab-1',
      ptyId: 'pty-1',
      terminal: makeTerminal({}),
      visible: false,
      nativeConpty: false,
      extra: { dims: '120x40', image: true, owner: 'shell', frame: 'normal', spare: true }
    })

    // Why 12: main's diagnosticLog:write handler drops fields past the twelfth.
    expect(Object.keys(write.mock.calls[0]![1] ?? {}).length).toBeLessThanOrEqual(12)
  })

  it('is a no-op without the bridge and swallows a rejected write', async () => {
    installDiagnosticApi(undefined)
    expect(() => logTerminalRestoreDiagnostic('layout-restore', { tabId: 'tab-1' })).not.toThrow()

    const rejected = vi.fn<DiagnosticWrite>(() => Promise.reject(new Error('bridge gone')))
    installDiagnosticApi(rejected)
    expect(() =>
      logTerminalRestoreDiagnostic('snapshot-unavailable', { tabId: 'tab-1' })
    ).not.toThrow()
    await Promise.resolve()
    expect(rejected).toHaveBeenCalledTimes(1)
  })
})

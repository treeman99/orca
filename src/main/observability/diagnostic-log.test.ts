import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  bindDiagnosticLogSettings,
  DIAGNOSTIC_LOG_FILENAME,
  DIAGNOSTIC_LOG_TAG,
  flushDiagnosticLog,
  formatDiagnosticLine,
  resolveDiagnosticLogDirectory,
  writeDiagnosticLine
} from './diagnostic-log'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-diag-log-'))
  dirs.push(dir)
  return dir
}

function bind(settings: Partial<GlobalSettings>): void {
  bindDiagnosticLogSettings({ getSettings: () => settings as GlobalSettings })
}

function readLog(dir: string): string {
  return readFileSync(join(dir, DIAGNOSTIC_LOG_FILENAME), 'utf8')
}

afterEach(() => {
  bindDiagnosticLogSettings(null)
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('diagnostic log', () => {
  it('writes nothing while the setting is off', async () => {
    const dir = tempDir()
    bind({ diagnosticLogEnabled: false, diagnosticLogDirectory: dir })

    writeDiagnosticLine('worker-pane-main', { task: 't1' })
    await flushDiagnosticLog()

    expect(existsSync(join(dir, DIAGNOSTIC_LOG_FILENAME))).toBe(false)
  })

  it('appends one tagged line per record once enabled', async () => {
    const dir = tempDir()
    bind({ diagnosticLogEnabled: true, diagnosticLogDirectory: dir })

    writeDiagnosticLine('worker-pane-main', { task: 't1', agent: 'opencode' })
    writeDiagnosticLine('worker-pane-renderer', { group: 'none', skip: 'preference-off' })
    await flushDiagnosticLog()

    const lines = readLog(dir).trimEnd().split('\n')
    expect(lines).toHaveLength(2)
    // Why assert the literal: this tag is what a user searches for, and what they
    // retype into a report — it must not drift.
    expect(lines[0]).toContain(`[${DIAGNOSTIC_LOG_TAG} `)
    expect(lines[0]).toContain('worker-pane-main task=t1 agent=opencode')
    expect(lines[1]).toContain('worker-pane-renderer group=none skip=preference-off')
  })

  // Why: the caller is main's event loop, which also forwards keystrokes to the PTY — sync disk
  // I/O here stalled typing on EDR-scanned Windows disks.
  it('leaves the disk untouched on the caller stack and keeps lines in call order', async () => {
    const dir = join(tempDir(), 'nested')
    bind({ diagnosticLogEnabled: true, diagnosticLogDirectory: dir })

    for (let i = 0; i < 20; i += 1) {
      writeDiagnosticLine('terminal-restore', { seq: i })
    }
    expect(existsSync(dir)).toBe(false)

    await flushDiagnosticLog()
    const seqs = readLog(dir)
      .trimEnd()
      .split('\n')
      .map((line) => line.replace(/.*seq=/, ''))
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => String(i)))
  })

  it('keeps a line to one token per field so it survives being retyped', () => {
    const line = formatDiagnosticLine('worker-pane-main', {
      task: 't 1',
      empty: '',
      missing: undefined,
      ok: true
    })

    expect(line).toContain('task=t_1')
    expect(line).not.toContain('empty=')
    expect(line).not.toContain('missing=')
    expect(line).toContain('ok=true')
    expect(line.split('\n')).toHaveLength(1)
  })

  it('falls back to the app logs directory when no folder is configured', () => {
    expect(resolveDiagnosticLogDirectory({ diagnosticLogDirectory: '  ' } as GlobalSettings)).toBe(
      resolveDiagnosticLogDirectory(null)
    )
  })

  it('does not throw when the configured folder cannot be written', async () => {
    bind({ diagnosticLogEnabled: true, diagnosticLogDirectory: join(tempDir(), 'x\0y') })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => writeDiagnosticLine('worker-pane-main', { task: 't1' })).not.toThrow()
    await expect(flushDiagnosticLog()).resolves.toBeUndefined()
    // A failed line must not wedge the queue for the next folder.
    const dir = tempDir()
    bind({ diagnosticLogEnabled: true, diagnosticLogDirectory: dir })
    writeDiagnosticLine('worker-pane-main', { task: 't2' })
    await flushDiagnosticLog()
    expect(readLog(dir)).toContain('task=t2')
    warn.mockRestore()
  })
})

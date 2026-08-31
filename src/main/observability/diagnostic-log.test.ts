import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  bindDiagnosticLogSettings,
  DIAGNOSTIC_LOG_FILENAME,
  DIAGNOSTIC_LOG_TAG,
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
  it('writes nothing while the setting is off', () => {
    const dir = tempDir()
    bind({ diagnosticLogEnabled: false, diagnosticLogDirectory: dir })

    writeDiagnosticLine('worker-pane-main', { task: 't1' })

    expect(existsSync(join(dir, DIAGNOSTIC_LOG_FILENAME))).toBe(false)
  })

  it('appends one tagged line per record once enabled', () => {
    const dir = tempDir()
    bind({ diagnosticLogEnabled: true, diagnosticLogDirectory: dir })

    writeDiagnosticLine('worker-pane-main', { task: 't1', agent: 'opencode' })
    writeDiagnosticLine('worker-pane-renderer', { group: 'none', skip: 'preference-off' })

    const lines = readLog(dir).trimEnd().split('\n')
    expect(lines).toHaveLength(2)
    // Why assert the literal: this tag is what a user searches for, and what they
    // retype into a report — it must not drift.
    expect(lines[0]).toContain(`[${DIAGNOSTIC_LOG_TAG} `)
    expect(lines[0]).toContain('worker-pane-main task=t1 agent=opencode')
    expect(lines[1]).toContain('worker-pane-renderer group=none skip=preference-off')
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

  it('does not throw when the configured folder cannot be written', () => {
    bind({ diagnosticLogEnabled: true, diagnosticLogDirectory: join(tempDir(), 'x\0y') })

    expect(() => writeDiagnosticLine('worker-pane-main', { task: 't1' })).not.toThrow()
  })
})

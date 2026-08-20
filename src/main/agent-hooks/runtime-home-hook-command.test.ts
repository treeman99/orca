import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { wrapRuntimeHomeHookCommand } from './runtime-home-hook-command'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'orca-runtime-home-hook-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('wrapRuntimeHomeHookCommand', () => {
  it('selects the runtime platform variant under HOME', () => {
    const command = wrapRuntimeHomeHookCommand('claude-hook')

    expect(command).toContain('case "${OSTYPE-}" in msys*|cygwin*|win32*)')
    expect(command).toContain('case "${HOME-}" in *\\&*|*\\^*|*\\(*|*\\)*|*\\;*|*,*|*=*|*%*|*\\!*)')
    expect(command).not.toContain('uname')
    expect(command).toContain('"${HOME-}/.orca/agent-hooks/claude-hook.cmd"')
    expect(command).toContain('/bin/sh "${HOME-}/.orca/agent-hooks/claude-hook.sh"')
    expect(command).not.toMatch(/[A-Z]:[\\/]|\/Users\/|\/home\//)
  })

  // Why: a static hook precheck (Grok) rejects the whole command on any bare reference it cannot
  // resolve, including one in a branch that platform never takes.
  it.each([
    ['default', undefined],
    ['neutral-json', { neutralJsonWhenMissing: true }]
  ])(
    'references every variable in default form (%s) so a static precheck cannot reject it',
    (_label, options) => {
      const command = wrapRuntimeHomeHookCommand('claude-hook', options)

      expect(command).toContain('"${SYSTEMROOT-}/System32/WindowsPowerShell/v1.0/powershell.exe"')
      expect(command).not.toMatch(/\$(?!\{)[A-Za-z_]/)
      expect(command).not.toMatch(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/)
    }
  )

  it('rejects a script base name that could inject shell syntax', () => {
    expect(() => wrapRuntimeHomeHookCommand('claude-hook; echo injected')).toThrow(
      'Invalid managed script base name'
    )
  })

  it('executes the destination HOME script for the current runtime', () => {
    const sourceHome = join(tmpDir, 'source profile')
    const destinationHome = join(tmpDir, "destination $HOME ' & profile")
    const sourceScriptDir = join(sourceHome, '.orca', 'agent-hooks')
    const destinationScriptDir = join(destinationHome, '.orca', 'agent-hooks')
    mkdirSync(sourceScriptDir, { recursive: true })
    mkdirSync(destinationScriptDir, { recursive: true })
    const windowsExitCode = process.platform === 'win32' ? 7 : 9
    const posixExitCode = process.platform === 'win32' ? 9 : 7
    writeFileSync(
      join(destinationScriptDir, 'claude-hook.cmd'),
      `@echo off\r\nexit /b ${windowsExitCode}\r\n`,
      'utf-8'
    )
    writeFileSync(
      join(destinationScriptDir, 'claude-hook.sh'),
      `#!/bin/sh\nexit ${posixExitCode}\n`,
      'utf-8'
    )
    writeFileSync(join(sourceScriptDir, 'claude-hook.cmd'), '@echo off\r\nexit /b 9\r\n', 'utf-8')
    writeFileSync(join(sourceScriptDir, 'claude-hook.sh'), '#!/bin/sh\nexit 9\n', 'utf-8')
    chmodSync(join(destinationScriptDir, 'claude-hook.sh'), 0o755)

    const shell =
      process.platform === 'win32'
        ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
        : '/bin/sh'
    const result = spawnSync(shell, ['-c', wrapRuntimeHomeHookCommand('claude-hook')], {
      env: {
        ...process.env,
        HOME: destinationHome.replaceAll('\\', '/'),
        USERPROFILE: destinationHome
      }
    })

    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr.toString()).toBe(7)
  })

  it.skipIf(process.platform !== 'win32')('keeps common Windows profiles on the fast path', () => {
    const destinationHome = join(tmpDir, 'destination 国際 profile')
    const scriptDir = join(destinationHome, '.orca', 'agent-hooks')
    mkdirSync(scriptDir, { recursive: true })
    writeFileSync(join(scriptDir, 'claude-hook.cmd'), '@echo off\r\nexit /b 7\r\n', 'utf-8')
    const gitBash = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
    const result = spawnSync(gitBash, ['-c', wrapRuntimeHomeHookCommand('claude-hook')], {
      env: { ...process.env, HOME: destinationHome.replaceAll('\\', '/') }
    })

    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr.toString()).toBe(7)
  })

  it('drains stdin when HOME is unavailable', () => {
    const command = `unset HOME; ${wrapRuntimeHomeHookCommand('claude-hook')}`
    const shell =
      process.platform === 'win32'
        ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
        : '/bin/sh'
    const result = spawnSync(shell, ['-c', command], { input: Buffer.alloc(1_000_000, 'x') })

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
  })

  it('emits neutral JSON when a lifecycle script is missing', () => {
    const shell =
      process.platform === 'win32'
        ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
        : '/bin/sh'
    const result = spawnSync(
      shell,
      ['-c', wrapRuntimeHomeHookCommand('missing-orca-hook', { neutralJsonWhenMissing: true })],
      {
        env: { ...process.env, HOME: tmpDir.replaceAll('\\', '/') },
        input: Buffer.alloc(1_000_000, 'x')
      }
    )

    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr.toString()).toBe(0)
    expect(JSON.parse(result.stdout.toString().trim())).toEqual({})
  })
})

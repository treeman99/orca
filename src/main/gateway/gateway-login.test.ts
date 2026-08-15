import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawn = vi.hoisted(() => vi.fn())
vi.mock('node-pty', () => ({ spawn }))
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => false) }))
vi.mock('node:child_process', () => ({ execFileSync: vi.fn(() => '') }))

import { existsSync } from 'node:fs'
import type { GatewayLoginProgress } from '../../shared/gateway-auth'
import { __resetPersistedWindowsPathCacheForTests } from '../pty/windows-environment-path'
import { runGatewayLogin } from './gateway-login'

type SpawnCall = [string, string[], { cols: number; env: NodeJS.ProcessEnv }]

function lastSpawn(): SpawnCall {
  return spawn.mock.calls.at(-1) as unknown as SpawnCall
}

/** A pty stub that emits the given chunks and then exits with the given code. */
function stubTerminal(exitCode: number, ...chunks: string[]): void {
  spawn.mockImplementation(() => ({
    onData: (listener: (chunk: string) => void) => {
      for (const chunk of chunks) {
        queueMicrotask(() => listener(chunk))
      }
    },
    onExit: (listener: (event: { exitCode: number }) => void) => {
      queueMicrotask(() => queueMicrotask(() => listener({ exitCode })))
    },
    kill: () => {}
  }))
}

function withPlatform(platform: NodeJS.Platform): () => void {
  const original = process.platform
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  return () => Object.defineProperty(process, 'platform', { configurable: true, value: original })
}

const deps = { onProgress: () => {} }

describe('runGatewayLogin', () => {
  beforeEach(() => {
    spawn.mockReset()
    vi.mocked(existsSync).mockReset().mockReturnValue(false)
    __resetPersistedWindowsPathCacheForTests()
    stubTerminal(0, 'Opening your browser...\n')
  })

  it('runs `login` with no argument at all', async () => {
    await runGatewayLogin(deps)
    expect(lastSpawn()[1]).toEqual(['login'])
  })

  // Why: a wrapped PKCE URL is useless to both the user and the parser.
  it('gives the PTY a terminal wide enough for the authorization URL', async () => {
    await runGatewayLogin(deps)
    expect(lastSpawn()[2].cols).toBeGreaterThanOrEqual(200)
  })

  // Unlike the AWS lane, no completion phrase is matched: gateway-cli's success wording
  // is unknown, and requiring a guessed one would fail a sign-in that actually worked.
  it('treats a zero exit as success even with no recognizable success message', async () => {
    stubTerminal(0, 'done\n')
    await expect(runGatewayLogin(deps)).resolves.toEqual({ ok: true })
  })

  it('surfaces the CLI complaint when the sign-in fails', async () => {
    stubTerminal(3, 'Error: unauthorized tenant\n')
    await expect(runGatewayLogin(deps)).resolves.toEqual({
      ok: false,
      reason: 'failed',
      message: 'Error: unauthorized tenant'
    })
  })

  it('falls back to the exit code when nothing readable was printed', async () => {
    stubTerminal(7, '')
    await expect(runGatewayLogin(deps)).resolves.toMatchObject({
      ok: false,
      reason: 'failed',
      message: 'gateway-cli login exited with code 7'
    })
  })

  it('reports progress once per changed value', async () => {
    const seen: GatewayLoginProgress[] = []
    stubTerminal(
      0,
      'Visit https://gateway.corp.example.com/authorize?x=1\n',
      'Visit https://gateway.corp.example.com/authorize?x=1\n',
      'Then confirm the code: WXYZ-1234\n'
    )
    await runGatewayLogin({ onProgress: (progress) => seen.push(progress) })
    expect(seen).toEqual([
      { userCode: null, verificationUrl: 'https://gateway.corp.example.com/authorize?x=1' },
      {
        userCode: 'WXYZ-1234',
        verificationUrl: 'https://gateway.corp.example.com/authorize?x=1'
      }
    ])
  })

  // Regression from the AWS lane: a missing binary was indistinguishable from a broken
  // node-pty, which sent users looking for a CLI that was already installed.
  it('reports a spawn failure as gateway-unavailable, not as a PTY problem', async () => {
    spawn.mockImplementation(() => {
      throw new Error('spawn gateway-cli ENOENT')
    })
    await expect(runGatewayLogin(deps)).resolves.toMatchObject({
      ok: false,
      reason: 'gateway-unavailable'
    })
  })

  it('resolves cancelled when the signal is already aborted', async () => {
    await expect(runGatewayLogin({ ...deps, signal: AbortSignal.abort() })).resolves.toEqual({
      ok: false,
      reason: 'cancelled'
    })
  })

  it('resolves cancelled when the signal fires mid-flight', async () => {
    spawn.mockImplementation(() => ({ onData: () => {}, onExit: () => {}, kill: () => {} }))
    const controller = new AbortController()
    const pending = runGatewayLogin({ ...deps, signal: controller.signal })
    controller.abort()
    await expect(pending).resolves.toEqual({ ok: false, reason: 'cancelled' })
  })

  it('spawns the bare name off Windows', async () => {
    const restore = withPlatform('darwin')
    try {
      await runGatewayLogin(deps)
      expect(lastSpawn()[0]).toBe('gateway-cli')
    } finally {
      restore()
    }
  })

  // Regression from the AWS lane: a bare name fails to launch on a machine where the CLI
  // is installed as a .cmd shim.
  it('spawns the absolute path it resolved on Windows', async () => {
    const restore = withPlatform('win32')
    const exe = 'C:\\Tools\\gateway\\gateway-cli.exe'
    vi.stubEnv('PATH', 'C:\\Tools\\gateway')
    vi.mocked(existsSync).mockImplementation((candidate) => candidate === exe)
    try {
      await runGatewayLogin(deps)
      expect(lastSpawn()[0]).toBe(exe)
    } finally {
      restore()
      vi.unstubAllEnvs()
    }
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFile = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile, execFileSync: vi.fn(() => '') }))
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => false) }))

import { existsSync } from 'node:fs'
import { __resetPersistedWindowsPathCacheForTests } from '../pty/windows-environment-path'
import { detectGatewayCli } from './gateway-cli-availability'

type ExecFileCall = [string, string[], { timeout: number; env: NodeJS.ProcessEnv }]

function lastCall(): ExecFileCall {
  return execFile.mock.calls.at(-1) as unknown as ExecFileCall
}

function succeedWith(stdout: string, stderr = ''): void {
  execFile.mockImplementation((_cmd, _args, _options, callback) => {
    callback(null, stdout, stderr)
  })
}

/** An error shaped like the one execFile reports for a non-zero exit. */
function failWith(code: string | number, stdout = '', stderr = ''): void {
  execFile.mockImplementation((_cmd, _args, _options, callback) => {
    callback(Object.assign(new Error(`exited with ${code}`), { code }), stdout, stderr)
  })
}

function withPlatform(platform: NodeJS.Platform): () => void {
  const original = process.platform
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  return () => Object.defineProperty(process, 'platform', { configurable: true, value: original })
}

describe('detectGatewayCli', () => {
  beforeEach(() => {
    execFile.mockReset()
    vi.mocked(existsSync).mockReset().mockReturnValue(false)
    __resetPersistedWindowsPathCacheForTests()
    succeedWith('gateway-cli/1.4.2 (darwin/arm64)\n')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('parses the named version from stdout', async () => {
    await expect(detectGatewayCli()).resolves.toEqual({ available: true, version: '1.4.2' })
  })

  it('parses a space-separated version from stderr', async () => {
    succeedWith('', 'gateway-cli v2.0.0-rc1\n')
    await expect(detectGatewayCli()).resolves.toEqual({ available: true, version: '2.0.0-rc1' })
  })

  it('falls back to a bare semver when the name is worded differently', async () => {
    succeedWith('Corporate Gateway 3.1.0\n')
    await expect(detectGatewayCli()).resolves.toEqual({ available: true, version: '3.1.0' })
  })

  it('reports available with no version when the output has none', async () => {
    succeedWith('ok\n')
    await expect(detectGatewayCli()).resolves.toEqual({ available: true, version: null })
  })

  it('reports unavailable only when the binary is missing', async () => {
    failWith('ENOENT')
    await expect(detectGatewayCli()).resolves.toEqual({ available: false, version: null })
  })

  // The binary may simply not know `--version`; that is installed, not missing.
  it('reports available when the binary ran but rejected the flag', async () => {
    failWith(2, '', 'unknown flag: --version\n')
    await expect(detectGatewayCli()).resolves.toEqual({ available: true, version: null })
  })

  it('passes an explicit environment to the probe', async () => {
    await detectGatewayCli()
    expect(lastCall()[2].env).toBeDefined()
  })

  // Regression from the AWS lane: a 5s budget expired during a cold start behind endpoint
  // protection, and the timeout was reported to the user as "CLI is not installed".
  it('allows a cold start far longer than five seconds', async () => {
    await detectGatewayCli()
    expect(lastCall()[2].timeout).toBeGreaterThanOrEqual(15_000)
  })

  it('spawns the bare name off Windows', async () => {
    const restore = withPlatform('darwin')
    try {
      await detectGatewayCli()
      expect(lastCall()[0]).toBe('gateway-cli')
      expect(lastCall()[1]).toEqual(['--version'])
    } finally {
      restore()
    }
  })

  // Regression from the AWS lane: a bare name is what made an installed CLI look missing.
  it('spawns the absolute path it resolved on Windows', async () => {
    const restore = withPlatform('win32')
    const exe = 'C:\\Tools\\gateway\\gateway-cli.exe'
    vi.stubEnv('PATH', 'C:\\Tools\\gateway')
    vi.mocked(existsSync).mockImplementation((candidate) => candidate === exe)
    try {
      await detectGatewayCli()
      expect(lastCall()[0]).toBe(exe)
    } finally {
      restore()
    }
  })
})

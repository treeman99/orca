import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProcessSpec } from '../../shared/child-process/process-spec'

// The seam under test is the child-process chokepoint, not `node:child_process`: this probe
// hands `runProcess` a bare program and lets it own the Windows `.cmd` shim and hidden console.
const runProcess = vi.hoisted(() => vi.fn())
vi.mock('../../shared/child-process/run-process', () => ({ runProcess }))
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => false) }))

import { existsSync } from 'node:fs'
import { __resetPersistedWindowsPathCacheForTests } from '../pty/windows-environment-path'
import { detectGatewayCli } from './gateway-cli-availability'

function lastSpec(): ProcessSpec {
  return runProcess.mock.calls.at(-1)?.[0] as ProcessSpec
}

function succeedWith(stdout: string, stderr = ''): void {
  runProcess.mockResolvedValue({ code: 0, signal: null, stdout, stderr, timedOut: false })
}

/** The CLI ran and exited non-zero — installed, just unhappy with the flag. */
function exitWith(code: number, stdout = '', stderr = ''): void {
  runProcess.mockResolvedValue({ code, signal: null, stdout, stderr, timedOut: false })
}

function withPlatform(platform: NodeJS.Platform): () => void {
  const original = process.platform
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  return () => Object.defineProperty(process, 'platform', { configurable: true, value: original })
}

describe('detectGatewayCli', () => {
  beforeEach(() => {
    runProcess.mockReset()
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
    runProcess.mockRejectedValue(
      Object.assign(new Error('spawn gateway-cli ENOENT'), { code: 'ENOENT' })
    )
    await expect(detectGatewayCli()).resolves.toEqual({ available: false, version: null })
  })

  // A killed probe proves nothing about the install, so it must not read as "present".
  it('reports unavailable when the probe was killed on its deadline', async () => {
    runProcess.mockResolvedValue({
      code: null,
      signal: 'SIGTERM',
      stdout: '',
      stderr: '',
      timedOut: true
    })
    await expect(detectGatewayCli()).resolves.toEqual({ available: false, version: null })
  })

  // The binary may simply not know `--version`; that is installed, not missing.
  it('reports available when the binary ran but rejected the flag', async () => {
    exitWith(2, '', 'unknown flag: --version\n')
    await expect(detectGatewayCli()).resolves.toEqual({ available: true, version: null })
  })

  it('passes an explicit environment to the probe', async () => {
    await detectGatewayCli()
    expect(lastSpec().env).toBeDefined()
  })

  // Regression from the AWS lane: a 5s budget expired during a cold start behind endpoint
  // protection, and the timeout was reported to the user as "CLI is not installed".
  it('allows a cold start far longer than five seconds', async () => {
    await detectGatewayCli()
    expect(lastSpec().timeoutMs).toBeGreaterThanOrEqual(15_000)
  })

  it('spawns the bare name off Windows', async () => {
    const restore = withPlatform('darwin')
    try {
      await detectGatewayCli()
      expect(lastSpec().program).toBe('gateway-cli')
      expect(lastSpec().args).toEqual(['--version'])
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
      expect(lastSpec().program).toBe(exe)
    } finally {
      restore()
    }
  })

  // Why this matters: the probe used to pre-wrap a shim in `cmd.exe /d /c`, which re-parses
  // the command line. Handing the shim straight to the runner is what lets it build the
  // argv itself (`buildWindowsCmdShimCommandLine`) and keep the console hidden.
  it('hands a Windows .cmd shim to the runner instead of pre-wrapping it', async () => {
    const restore = withPlatform('win32')
    const shim = 'C:\\Tools\\gateway\\gateway-cli.cmd'
    vi.stubEnv('PATH', 'C:\\Tools\\gateway')
    vi.stubEnv('PATHEXT', '.EXE;.CMD')
    vi.mocked(existsSync).mockImplementation((candidate) => candidate === shim)
    try {
      await detectGatewayCli()
      expect(lastSpec().program).toBe(shim)
      expect(lastSpec().args).toEqual(['--version'])
    } finally {
      restore()
    }
  })
})

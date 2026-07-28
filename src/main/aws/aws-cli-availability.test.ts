import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFile = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile, execFileSync: vi.fn(() => '') }))
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => false) }))

import { existsSync } from 'node:fs'
import { __resetPersistedWindowsPathCacheForTests } from '../pty/windows-environment-path'
import { detectAwsCli } from './aws-cli-availability'

type ExecFileCall = [string, string[], { timeout: number; env: NodeJS.ProcessEnv }]

function lastCall(): ExecFileCall {
  return execFile.mock.calls.at(-1) as unknown as ExecFileCall
}

/** Resolve the probe with the output a real CLI would print. */
function succeedWith(stdout: string, stderr = ''): void {
  execFile.mockImplementation((_cmd, _args, _options, callback) => {
    callback(null, stdout, stderr)
  })
}

function withPlatform(platform: NodeJS.Platform): () => void {
  const original = process.platform
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  return () => Object.defineProperty(process, 'platform', { configurable: true, value: original })
}

describe('detectAwsCli', () => {
  beforeEach(() => {
    execFile.mockReset()
    vi.mocked(existsSync).mockReset().mockReturnValue(false)
    __resetPersistedWindowsPathCacheForTests()
    succeedWith('aws-cli/2.34.63 Python/3.14.5 Windows/11 exe/AMD64\n')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('parses the version v2 prints on stdout', async () => {
    await expect(detectAwsCli()).resolves.toEqual({ available: true, version: '2.34.63' })
  })

  it('parses the version v1 prints on stderr', async () => {
    succeedWith('', 'aws-cli/1.29.0 Python/3.11.4 Darwin/23.0.0 botocore/1.31.0')
    await expect(detectAwsCli()).resolves.toEqual({ available: true, version: '1.29.0' })
  })

  it('reports unavailable when the probe fails', async () => {
    execFile.mockImplementation((_cmd, _args, _options, callback) => {
      callback(new Error('ENOENT'), '', '')
    })
    await expect(detectAwsCli()).resolves.toEqual({ available: false, version: null })
  })

  // Regression: the probe used to inherit an unspecified env, so Electron's boot-time
  // PATH was the only one it ever saw.
  it('passes an explicit environment to the probe', async () => {
    await detectAwsCli()
    const [, , options] = lastCall()
    expect(options.env).toBeDefined()
    expect(options.env.AWS_PAGER).toBe('')
  })

  // Regression: a 5s budget expired during AWS CLI v2's cold start behind endpoint
  // protection, and the timeout was reported to the user as "AWS CLI is not installed".
  it('allows a cold start far longer than five seconds', async () => {
    await detectAwsCli()
    expect(lastCall()[2].timeout).toBeGreaterThanOrEqual(15_000)
  })

  it('spawns the bare name off Windows', async () => {
    const restore = withPlatform('darwin')
    try {
      await detectAwsCli()
      expect(lastCall()[0]).toBe('aws')
    } finally {
      restore()
    }
  })

  // Regression: a bare `aws` is what made a correctly installed CLI look missing.
  it('spawns the absolute path it resolved on Windows', async () => {
    const restore = withPlatform('win32')
    const exe = 'C:\\Program Files\\Amazon\\AWS CLI\\aws.exe'
    vi.stubEnv('Path', 'C:\\Program Files\\Amazon\\AWS CLI')
    vi.mocked(existsSync).mockImplementation((candidate) => candidate === exe)
    try {
      await detectAwsCli()
      expect(lastCall()[0]).toBe(exe)
      expect(lastCall()[1]).toEqual(['--version'])
    } finally {
      restore()
    }
  })
})

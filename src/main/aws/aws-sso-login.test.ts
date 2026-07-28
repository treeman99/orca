import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawn = vi.hoisted(() => vi.fn())
vi.mock('node-pty', () => ({ spawn }))
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => false) }))
vi.mock('node:child_process', () => ({ execFileSync: vi.fn(() => '') }))

import { existsSync } from 'node:fs'
import { __resetPersistedWindowsPathCacheForTests } from '../pty/windows-environment-path'
import { runAwsSsoLogin } from './aws-sso-login'

type SpawnCall = [string, string[], { env: NodeJS.ProcessEnv }]

/** A pty stub that exits immediately with the given code and output. */
function stubTerminal(exitCode: number, output = ''): void {
  spawn.mockImplementation(() => ({
    onData: (listener: (chunk: string) => void) => {
      if (output) {
        queueMicrotask(() => listener(output))
      }
    },
    onExit: (listener: (event: { exitCode: number }) => void) => {
      queueMicrotask(() => listener({ exitCode }))
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

describe('runAwsSsoLogin', () => {
  beforeEach(() => {
    spawn.mockReset()
    vi.mocked(existsSync).mockReset().mockReturnValue(false)
    __resetPersistedWindowsPathCacheForTests()
    stubTerminal(0, 'Successfully logged into Start URL: https://example.awsapps.com/start\n')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolves ok when the CLI reports a completed sign-in', async () => {
    await expect(runAwsSsoLogin('dev', { useDeviceCode: false }, deps)).resolves.toEqual({
      ok: true,
      profile: 'dev'
    })
  })

  it('passes the profile and honors --use-device-code', async () => {
    await runAwsSsoLogin('dev', { useDeviceCode: true }, deps)
    const [, args] = spawn.mock.calls.at(-1) as unknown as SpawnCall
    expect(args).toEqual(['sso', 'login', '--profile', 'dev', '--use-device-code'])
  })

  // Regression: the pager would otherwise hold the authorization URL hostage.
  it('clears AWS_PAGER in the spawned environment', async () => {
    await runAwsSsoLogin('dev', { useDeviceCode: false }, deps)
    const [, , options] = spawn.mock.calls.at(-1) as unknown as SpawnCall
    expect(options.env.AWS_PAGER).toBe('')
  })

  it('spawns the bare name off Windows', async () => {
    const restore = withPlatform('darwin')
    try {
      await runAwsSsoLogin('dev', { useDeviceCode: false }, deps)
      expect((spawn.mock.calls.at(-1) as unknown as SpawnCall)[0]).toBe('aws')
    } finally {
      restore()
    }
  })

  // Regression: a bare `aws` fails to launch on a machine where the CLI is installed.
  it('spawns the absolute path it resolved on Windows', async () => {
    const restore = withPlatform('win32')
    const exe = 'C:\\Program Files\\Amazon\\AWS CLI\\aws.exe'
    vi.stubEnv('Path', 'C:\\Program Files\\Amazon\\AWS CLI')
    vi.mocked(existsSync).mockImplementation((candidate) => candidate === exe)
    try {
      await runAwsSsoLogin('dev', { useDeviceCode: false }, deps)
      expect((spawn.mock.calls.at(-1) as unknown as SpawnCall)[0]).toBe(exe)
    } finally {
      restore()
    }
  })

  // Regression: a missing binary used to be indistinguishable from a broken node-pty,
  // which sent users looking for an AWS CLI that was already installed.
  it('reports a spawn failure as aws-unavailable, not as a PTY problem', async () => {
    spawn.mockImplementation(() => {
      throw new Error('spawn aws ENOENT')
    })
    await expect(runAwsSsoLogin('dev', { useDeviceCode: false }, deps)).resolves.toMatchObject({
      ok: false,
      reason: 'aws-unavailable'
    })
  })

  it('surfaces the CLI error message when the sign-in fails', async () => {
    stubTerminal(255, 'Error when retrieving token from sso: Token has expired\n')
    const result = await runAwsSsoLogin('dev', { useDeviceCode: false }, deps)
    expect(result).toMatchObject({ ok: false, reason: 'failed' })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFile = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile, execFileSync: vi.fn(() => '') }))
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => false) }))

import { existsSync } from 'node:fs'
import { __resetPersistedWindowsPathCacheForTests } from '../pty/windows-environment-path'
import { runGatewayVerify } from './gateway-verify'

type ExecFileCall = [string, string[], { timeout: number; env: NodeJS.ProcessEnv }]

function lastCall(): ExecFileCall {
  return execFile.mock.calls.at(-1) as unknown as ExecFileCall
}

function respond(error: Error | null, stdout = '', stderr = ''): void {
  execFile.mockImplementation((_cmd, _args, _options, callback) => {
    callback(error, stdout, stderr)
  })
}

describe('runGatewayVerify', () => {
  beforeEach(() => {
    execFile.mockReset()
    vi.mocked(existsSync).mockReset().mockReturnValue(false)
    __resetPersistedWindowsPathCacheForTests()
    respond(null, '{"signedIn":true,"identity":"dev@corp.example"}')
  })

  it('runs `verify` with no other argument', async () => {
    await runGatewayVerify()
    expect(lastCall()[1]).toEqual(['verify'])
    expect(lastCall()[2].timeout).toBeGreaterThanOrEqual(15_000)
  })

  it('returns what the parser made of a successful probe', async () => {
    await expect(runGatewayVerify()).resolves.toEqual({
      signedIn: true,
      expiresAt: null,
      identity: 'dev@corp.example',
      detail: null
    })
  })

  // A non-zero exit is the CLI's normal way of saying "not signed in", so its output
  // still has to be read rather than thrown away.
  it('parses the output of a non-zero exit', async () => {
    respond(Object.assign(new Error('exit 1'), { code: 1 }), '', 'not logged in\n')
    const result = await runGatewayVerify()
    expect(result.signedIn).toBe(false)
    expect(result.detail).toBe('not logged in')
  })

  it('reports a readable reason when the CLI cannot be spawned', async () => {
    respond(Object.assign(new Error('spawn gateway-cli ENOENT'), { code: 'ENOENT' }))
    await expect(runGatewayVerify()).resolves.toEqual({
      signedIn: false,
      expiresAt: null,
      identity: null,
      detail: 'spawn gateway-cli ENOENT'
    })
  })

  it('reports a timeout as signed out rather than guessing from an empty exit code', async () => {
    respond(Object.assign(new Error('timed out'), { code: null, killed: true }))
    const result = await runGatewayVerify()
    expect(result.signedIn).toBe(false)
    expect(result.detail).toBe('timed out')
  })
})

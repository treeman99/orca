import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProcessSpec } from '../../shared/child-process/process-spec'

// The seam under test is the child-process chokepoint, not `node:child_process`.
const runProcess = vi.hoisted(() => vi.fn())
vi.mock('../../shared/child-process/run-process', () => ({ runProcess }))
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => false) }))

import { existsSync } from 'node:fs'
import { __resetPersistedWindowsPathCacheForTests } from '../pty/windows-environment-path'
import { runGatewayVerify } from './gateway-verify'

function lastSpec(): ProcessSpec {
  return runProcess.mock.calls.at(-1)?.[0] as ProcessSpec
}

function exitWith(code: number, stdout = '', stderr = ''): void {
  runProcess.mockResolvedValue({ code, signal: null, stdout, stderr, timedOut: false })
}

describe('runGatewayVerify', () => {
  beforeEach(() => {
    runProcess.mockReset()
    vi.mocked(existsSync).mockReset().mockReturnValue(false)
    __resetPersistedWindowsPathCacheForTests()
    exitWith(0, '{"signedIn":true,"identity":"dev@corp.example"}')
  })

  it('runs `verify` with no other argument', async () => {
    await runGatewayVerify()
    expect(lastSpec().args).toEqual(['verify'])
    expect(lastSpec().timeoutMs).toBeGreaterThanOrEqual(15_000)
  })

  it('returns what the parser made of a successful probe', async () => {
    await expect(runGatewayVerify()).resolves.toEqual({
      signedIn: true,
      evidence: 'json',
      expiresAt: null,
      identity: 'dev@corp.example',
      detail: null
    })
  })

  // A non-zero exit is the CLI's normal way of saying "not signed in", so its output
  // still has to be read rather than thrown away.
  it('parses the output of a non-zero exit', async () => {
    exitWith(1, '', 'not logged in\n')
    const result = await runGatewayVerify()
    expect(result.signedIn).toBe(false)
    expect(result.detail).toBe('not logged in')
  })

  it('reports a readable reason when the CLI cannot be spawned', async () => {
    runProcess.mockRejectedValue(
      Object.assign(new Error('spawn gateway-cli ENOENT'), { code: 'ENOENT' })
    )
    await expect(runGatewayVerify()).resolves.toEqual({
      signedIn: false,
      evidence: 'none',
      expiresAt: null,
      identity: null,
      detail: 'spawn gateway-cli ENOENT'
    })
  })

  it('reports a timeout as signed out rather than guessing from an empty exit code', async () => {
    runProcess.mockResolvedValue({
      code: null,
      signal: 'SIGTERM',
      stdout: '',
      stderr: '',
      timedOut: true
    })
    const result = await runGatewayVerify()
    expect(result.signedIn).toBe(false)
    expect(result.evidence).toBe('none')
    expect(result.detail).toContain('timed out')
  })
})

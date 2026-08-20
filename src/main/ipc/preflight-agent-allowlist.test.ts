// Fork-owned: proves `allowedAgents` narrows agent DETECTION, not just the pickers.
// Detection is what feeds every picker, the auto-pick fallback, the quick-launch rows and the
// keyboard chords — and it is the same answer the web client, the mobile client and the CLI
// receive, none of which can see the renderer-side policy view at all.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  handleMock,
  execFileMock,
  execFileAsyncMock,
  hydrateShellPathMock,
  mergePathSegmentsMock,
  getActiveMultiplexerMock,
  resolveCliCommandsMock,
  isCommandOnLocalPathMock,
  mergePersistedWindowsPathAsyncMock,
  mergePersistedWindowsPathMock,
  getEnterprisePolicyMock
} = vi.hoisted(() => ({
  handleMock: vi.fn(),
  execFileMock: vi.fn(),
  execFileAsyncMock: vi.fn(),
  hydrateShellPathMock: vi.fn(),
  mergePathSegmentsMock: vi.fn(),
  getActiveMultiplexerMock: vi.fn(),
  resolveCliCommandsMock: vi.fn(),
  isCommandOnLocalPathMock: vi.fn(),
  mergePersistedWindowsPathAsyncMock: vi.fn(),
  mergePersistedWindowsPathMock: vi.fn(),
  getEnterprisePolicyMock: vi.fn()
}))

vi.mock('electron', () => ({ ipcMain: { handle: handleMock } }))
vi.mock('child_process', () => {
  const execFileWithPromisify = Object.assign(execFileMock, {
    [Symbol.for('nodejs.util.promisify.custom')]: execFileAsyncMock
  })
  return { execFile: execFileWithPromisify, spawn: vi.fn() }
})
vi.mock('../startup/hydrate-shell-path', () => ({
  hydrateShellPath: hydrateShellPathMock,
  mergePathSegments: mergePathSegmentsMock
}))
vi.mock('../../shared/node-cli-command-resolution', () => ({
  resolveCliCommands: resolveCliCommandsMock
}))
vi.mock('./command-path-resolver', () => ({ isCommandOnLocalPath: isCommandOnLocalPathMock }))
vi.mock('../pty/windows-environment-path', () => ({
  mergePersistedWindowsPathAsync: mergePersistedWindowsPathAsyncMock,
  mergePersistedWindowsPath: mergePersistedWindowsPathMock
}))
vi.mock('./ssh', () => ({ getActiveMultiplexer: getActiveMultiplexerMock }))
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))

import { detectInstalledAgents } from './preflight'
import { resetPreflightMocks, type HandlerMap } from './preflight-test-harness'
import { makeEnterprisePolicy } from '../../shared/enterprise-policy-fixture'

const handlers: HandlerMap = {}

function onlyTheseOnPath(installed: readonly string[]): void {
  execFileAsyncMock.mockImplementation(async (command: string, args: string[]) => {
    if (command !== 'which') {
      throw new Error(`unexpected command ${String(command)}`)
    }
    if (installed.includes(String(args[0]))) {
      return { stdout: `/Users/test/.local/bin/${String(args[0])}\n` }
    }
    throw new Error('not found')
  })
  resolveCliCommandsMock.mockImplementation(() => new Map())
}

describe('agent detection under an enterprise allowlist', () => {
  beforeEach(() => {
    resetPreflightMocks(
      {
        handleMock,
        execFileAsyncMock,
        hydrateShellPathMock,
        mergePathSegmentsMock,
        getActiveMultiplexerMock,
        resolveCliCommandsMock,
        isCommandOnLocalPathMock,
        mergePersistedWindowsPathAsyncMock,
        mergePersistedWindowsPathMock
      },
      handlers
    )
    getEnterprisePolicyMock.mockReset()
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
  })

  it('drops agents the enterprise policy does not allow from local detection', async () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    onlyTheseOnPath(['claude', 'codex', 'opencode'])

    // Both allowed agents survive — the allowlist narrows, it does not pick a winner. This is
    // the fleet's expected result: claude and opencode visible, codex gone.
    await expect(detectInstalledAgents()).resolves.toEqual(['claude', 'opencode'])
  })

  // The other half of the same contract, and the case a developer machine usually shows:
  // an allowed agent that is not installed simply is not detected. "Allowed" is not "present",
  // so an empty-looking picker here means the CLI is missing, not that the policy hid it.
  it('reports only the allowed agents that are actually installed', async () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeEnterprisePolicy({ allowedAgents: ['claude', 'opencode'] })
    )
    onlyTheseOnPath(['claude'])

    await expect(detectInstalledAgents()).resolves.toEqual(['claude'])
  })

  it('leaves detection unrestricted when the policy sets no allowlist', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy({ lockdown: true }))
    onlyTheseOnPath(['claude', 'codex'])

    // allowedAgents deliberately does not inherit lockdown — an admin must name the agents.
    await expect(detectInstalledAgents()).resolves.toEqual(['claude', 'codex'])
  })
})

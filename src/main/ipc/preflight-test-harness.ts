import path from 'node:path'
import type { Mock } from 'vitest'
import { _resetPreflightCache } from './preflight'

export type HandlerMap = Record<string, (_event?: unknown, args?: unknown) => Promise<unknown>>

export type PreflightMocks = {
  handleMock: Mock
  execFileAsyncMock: Mock
  hydrateShellPathMock: Mock
  mergePathSegmentsMock: Mock
  getActiveMultiplexerMock: Mock
  resolveCliCommandsMock: Mock
  isCommandOnLocalPathMock: Mock
  mergePersistedWindowsPathAsyncMock: Mock
  mergePersistedWindowsPathMock: Mock
}

/** Shared per-test reset: mock defaults, cleared cache, darwin platform, fresh handler map. */
export function resetPreflightMocks(mocks: PreflightMocks, handlers: HandlerMap): void {
  const {
    handleMock,
    execFileAsyncMock,
    hydrateShellPathMock,
    mergePathSegmentsMock,
    getActiveMultiplexerMock,
    resolveCliCommandsMock,
    isCommandOnLocalPathMock,
    mergePersistedWindowsPathAsyncMock,
    mergePersistedWindowsPathMock
  } = mocks

  handleMock.mockReset()
  execFileAsyncMock.mockReset()
  hydrateShellPathMock.mockReset()
  hydrateShellPathMock.mockResolvedValue({ segments: [], ok: false, failureReason: 'no_shell' })
  mergePathSegmentsMock.mockReset()
  getActiveMultiplexerMock.mockReset()
  mergePersistedWindowsPathAsyncMock.mockReset()
  mergePersistedWindowsPathAsyncMock.mockResolvedValue(undefined)
  mergePersistedWindowsPathMock.mockReset()
  // Why: existing tests should keep treating `which` as the only source
  // unless a case explicitly exercises the install-dir fallback.
  resolveCliCommandsMock.mockReset()
  resolveCliCommandsMock.mockImplementation(
    (commands: string[]) => new Map(commands.map((command) => [command, command]))
  )
  // Why: reproduce the pre-#9297 local PATH check (spawn where/which, keep
  // only absolute resolutions) so cases that stub the where/which mock still
  // drive detection identically without a real subprocess.
  isCommandOnLocalPathMock.mockReset()
  isCommandOnLocalPathMock.mockImplementation(async (command: string) => {
    const finder = process.platform === 'win32' ? 'where' : 'which'
    try {
      const { stdout } = await execFileAsyncMock(finder, [command])
      return String(stdout)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .some((line) => path.isAbsolute(line))
    } catch {
      return false
    }
  })
  _resetPreflightCache()
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: 'darwin'
  })

  for (const key of Object.keys(handlers)) {
    delete handlers[key]
  }

  handleMock.mockImplementation((channel, handler) => {
    handlers[channel] = handler
  })
}

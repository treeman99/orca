// Behavioural test for the corporate agent allowlist at the PTY spawn chokepoint.
//
// The renderer already hides blocked agents from every picker, but hiding is not refusing:
// a keyboard chord bound before the policy landed, devtools, and the bundled web client all
// reach `pty:spawn` directly. These cases prove the refusal happens in main, and — just as
// important — that a build with no policy file spawns exactly as upstream does.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../enterprise/enterprise-policy-fixture'

const { handleMock, onMock, removeHandlerMock, removeAllListenersMock, policyState } = vi.hoisted(
  () => ({
    handleMock: vi.fn(),
    onMock: vi.fn(),
    removeHandlerMock: vi.fn(),
    removeAllListenersMock: vi.fn(),
    policyState: { current: null as unknown }
  })
)

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getPath: vi.fn().mockReturnValue('/tmp/orca-test-userdata')
  },
  ipcMain: {
    handle: handleMock,
    on: onMock,
    removeHandler: removeHandlerMock,
    removeAllListeners: removeAllListenersMock
  },
  powerMonitor: { on: vi.fn() }
}))

vi.mock('fs', () => ({
  existsSync: () => true,
  statSync: () => ({ isDirectory: () => true, mode: 0o755 }),
  accessSync: () => undefined,
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  chmodSync: vi.fn(),
  constants: { X_OK: 1 }
}))

vi.mock('node-pty', () => ({
  spawn: vi.fn().mockReturnValue({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    process: 'zsh',
    pid: 12345
  })
}))

vi.mock('../opencode/hook-service', () => ({
  openCodeHookService: { buildPtyEnv: () => ({}), clearPty: vi.fn() }
}))

vi.mock('../pi/titlebar-extension-service', () => ({
  piTitlebarExtensionService: { buildPtyEnv: () => ({}), clearPty: vi.fn() }
}))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => policyState.current
}))

import { registerPtyHandlers, setLocalPtyProvider } from './pty'
import type { IPtyProvider } from '../providers/types'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const mainWindow = {
  isDestroyed: () => false,
  webContents: { on: vi.fn(), send: vi.fn(), removeListener: vi.fn() }
}

let spawnSpy: ReturnType<typeof vi.fn>
// The runtime's own PTY entry point — what the CLI, a paired mobile client, an automation
// run and an orchestration dispatch reach instead of the `pty:spawn` IPC channel.
let ptyController: { spawn: (args: Record<string, unknown>) => Promise<unknown> } | null = null

function createMockProvider(): IPtyProvider {
  spawnSpy = vi.fn().mockResolvedValue({ id: 'pty-allowlist-test' })
  return {
    spawn: spawnSpy,
    attach: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    shutdown: vi.fn(),
    sendSignal: vi.fn(),
    getCwd: vi.fn(),
    getInitialCwd: vi.fn(),
    clearBuffer: vi.fn(),
    acknowledgeDataEvent: vi.fn(),
    hasChildProcesses: vi.fn(),
    getForegroundProcess: vi.fn(),
    serialize: vi.fn(),
    revive: vi.fn(),
    listProcesses: vi.fn(),
    getDefaultShell: vi.fn(),
    getProfiles: vi.fn(),
    onData: vi.fn().mockReturnValue(() => {}),
    onReplay: vi.fn().mockReturnValue(() => {}),
    onExit: vi.fn().mockReturnValue(() => {})
  } as unknown as IPtyProvider
}

function spawnAgent(launchAgent: string): Promise<unknown> {
  return handlers.get('pty:spawn')!(null, {
    cols: 80,
    rows: 24,
    cwd: '/tmp/worktree',
    command: launchAgent,
    launchAgent,
    worktreeId: 'repo::/tmp/worktree'
  }) as Promise<unknown>
}

beforeEach(() => {
  handlers.clear()
  handleMock.mockReset()
  onMock.mockReset()
  handleMock.mockImplementation((channel: string, handler: (...a: unknown[]) => unknown) => {
    handlers.set(channel, handler)
  })
  onMock.mockImplementation((channel: string, handler: (...a: unknown[]) => unknown) => {
    handlers.set(channel, handler)
  })
  policyState.current = makeEnterprisePolicy()
  ptyController = null
  setLocalPtyProvider(createMockProvider() as never)
  registerPtyHandlers(mainWindow as never)
})

// Everything the spawn path calls on the runtime is incidental here; only
// setPtyController matters, so the rest resolve to inert stubs.
function registerWithRuntimeController(): void {
  const runtimeStub = new Proxy(
    {},
    {
      get: (_target, property) =>
        property === 'setPtyController'
          ? (controller: typeof ptyController) => {
              ptyController = controller
            }
          : vi.fn()
    }
  )
  registerPtyHandlers(mainWindow as never, runtimeStub as never)
}

describe('pty:spawn under the corporate agent allowlist', () => {
  it('refuses a launch for an agent the policy does not list', async () => {
    policyState.current = makeLockdownPolicy({ allowedAgents: ['claude', 'opencode'] })
    await expect(spawnAgent('codex')).rejects.toThrow(/agent_blocked_by_enterprise_policy/)
    expect(spawnSpy).not.toHaveBeenCalled()
  })

  it('still spawns an agent the policy lists', async () => {
    policyState.current = makeLockdownPolicy({ allowedAgents: ['claude', 'opencode'] })
    await expect(spawnAgent('claude')).resolves.toBeTruthy()
    expect(spawnSpy).toHaveBeenCalled()
  })

  // The no-regression half: without an allowlist nothing narrows, which is what a build
  // with no policy file — every non-corporate install — runs.
  it('spawns any agent when no allowlist is configured', async () => {
    await expect(spawnAgent('codex')).resolves.toBeTruthy()
    expect(spawnSpy).toHaveBeenCalled()
  })

  // allowedAgents deliberately does not inherit `lockdown`: which CLIs a site standardizes
  // on is a list an administrator has to write out.
  it('does not narrow on the master lockdown switch alone', async () => {
    policyState.current = makeLockdownPolicy()
    await expect(spawnAgent('codex')).resolves.toBeTruthy()
    expect(spawnSpy).toHaveBeenCalled()
  })
})

describe('the runtime PTY controller under the corporate agent allowlist', () => {
  beforeEach(() => {
    registerWithRuntimeController()
  })

  function controllerSpawn(launchAgent: string): Promise<unknown> {
    return ptyController!.spawn({
      cols: 80,
      rows: 24,
      cwd: '/tmp/worktree',
      command: launchAgent,
      launchAgent,
      worktreeId: 'repo::/tmp/worktree'
    })
  }

  it('refuses a blocked agent on the non-renderer entry point too', async () => {
    policyState.current = makeLockdownPolicy({ allowedAgents: ['claude', 'opencode'] })
    await expect(controllerSpawn('codex')).rejects.toThrow(/agent_blocked_by_enterprise_policy/)
    expect(spawnSpy).not.toHaveBeenCalled()
  })

  it('does not narrow when no allowlist is configured', async () => {
    await expect(controllerSpawn('codex')).resolves.toBeTruthy()
    expect(spawnSpy).toHaveBeenCalled()
  })
})

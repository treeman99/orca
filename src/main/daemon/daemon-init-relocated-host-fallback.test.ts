import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DAEMON_EXIT_ENDPOINT_OCCUPIED } from './daemon-endpoint-ownership'

const {
  forkMock,
  checkDaemonHealthMock,
  spawnerInstances,
  importFresh,
  installDefaultNetConnectStub,
  moduleFactories
} = await vi.hoisted(async () =>
  (await import('./daemon-init-test-harness')).createDaemonInitMocks()
)

const { materializeRelocatedDaemonHostMock } = vi.hoisted(() => ({
  materializeRelocatedDaemonHostMock: vi.fn<() => { execPath: string; entryPath: string } | null>()
}))

vi.mock('electron', () => moduleFactories.electron())
vi.mock('fs', () => moduleFactories.fs())
vi.mock('child_process', async (importOriginal) =>
  moduleFactories.childProcess(await importOriginal<Record<string, unknown>>())
)
vi.mock('net', () => moduleFactories.net())
vi.mock('./daemon-health', () => moduleFactories.daemonHealth())
vi.mock('./client', () => moduleFactories.client())
vi.mock('./daemon-lifecycle-event', () => moduleFactories.daemonLifecycleEvent())
vi.mock('./daemon-spawner', () => moduleFactories.daemonSpawner())
vi.mock('./daemon-pty-adapter', () => moduleFactories.daemonPtyAdapter())
vi.mock('../ipc/pty', () => moduleFactories.ipcPty())
vi.mock('./daemon-host-relocation', () => ({
  materializeRelocatedDaemonHost: materializeRelocatedDaemonHostMock,
  collectPinnedDaemonVersions: vi.fn(() => new Set<string>()),
  pruneOldDaemonHosts: vi.fn()
}))
// Why: the launch log appends synchronously to the real logs dir otherwise; the fallback is what's under test.
vi.mock('./daemon-launch-log', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logDaemonLaunch: vi.fn()
}))

const RELOCATED_HOST = {
  execPath: 'C:\\Local\\Orca\\daemon-host\\1.0.0\\orca-terminal-daemon.exe',
  entryPath: 'C:\\Local\\Orca\\daemon-host\\1.0.0\\resources\\daemon-entry.js'
}
const INSTALL_DIR_ENTRY = '/fake/app/out/main/daemon-entry.js'

type StubChild = {
  pid: number
  exitCode: number | null
  signalCode: NodeJS.Signals | null
  on: (event: string, cb: (arg?: unknown) => void) => StubChild
  once: (event: string, cb: (arg?: unknown) => void) => StubChild
  off: (event: string, cb: (arg?: unknown) => void) => StubChild
  disconnect: ReturnType<typeof vi.fn>
  unref: ReturnType<typeof vi.fn>
}

/** A child that exits with `exitCode` instead of ever reporting readiness. */
function createExitingChild(pid: number, exitCode: number): StubChild {
  const child: StubChild = {
    pid,
    exitCode: null,
    signalCode: null,
    on(event, cb) {
      if (event === 'exit') {
        queueMicrotask(() => {
          child.exitCode = exitCode
          cb(exitCode)
        })
      }
      return child
    },
    once: () => child,
    off: () => child,
    disconnect: vi.fn(),
    unref: vi.fn()
  }
  return child
}

function createReadyChild(pid: number): StubChild {
  const child: StubChild = {
    pid,
    exitCode: null,
    signalCode: null,
    on(event, cb) {
      if (event === 'message') {
        queueMicrotask(() => cb({ type: 'ready', startedAtMs: 1_000_000 }))
      }
      return child
    },
    once: () => child,
    off: () => child,
    disconnect: vi.fn(),
    unref: vi.fn()
  }
  return child
}

type Launcher = (
  socketPath: string,
  tokenPath: string,
  pidPath?: string,
  launchNonce?: string
) => Promise<{ shutdown(): Promise<void> }>

async function takeLauncher(): Promise<Launcher> {
  const mod = await importFresh()
  checkDaemonHealthMock.mockResolvedValue('unreachable')
  await mod.initDaemonPtyProvider()
  return spawnerInstances[0].launcher as Launcher
}

function forkedEntryPaths(): unknown[] {
  return forkMock.mock.calls.map((call) => call[0])
}

function forkedExecPaths(): unknown[] {
  return forkMock.mock.calls.map(
    (call) => (call[2] as { execPath?: unknown } | undefined)?.execPath
  )
}

describe('daemon-init: relocated daemon host launch fallback', () => {
  beforeEach(() => {
    installDefaultNetConnectStub()
    materializeRelocatedDaemonHostMock.mockReturnValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('retries from the install-dir host when the relocated image will not start', async () => {
    materializeRelocatedDaemonHostMock.mockReturnValue(RELOCATED_HOST)
    const launcher = await takeLauncher()
    forkMock.mockReturnValueOnce(createExitingChild(4001, 1))
    forkMock.mockReturnValueOnce(createReadyChild(4002))

    await expect(
      launcher('/fake/socket', '/fake/token', '/fake/daemon.pid', 'nonce')
    ).resolves.toMatchObject({ shutdown: expect.any(Function) })

    expect(forkedEntryPaths()).toEqual([RELOCATED_HOST.entryPath, INSTALL_DIR_ENTRY])
    // The retry must run the current binary, not the image the machine just refused.
    expect(forkedExecPaths()).toEqual([RELOCATED_HOST.execPath, undefined])
  })

  it('reports the original failure when the install-dir host fails too', async () => {
    materializeRelocatedDaemonHostMock.mockReturnValue(RELOCATED_HOST)
    const launcher = await takeLauncher()
    forkMock.mockReturnValueOnce(createExitingChild(4001, 1))
    forkMock.mockReturnValueOnce(createExitingChild(4002, 1))

    await expect(
      launcher('/fake/socket', '/fake/token', '/fake/daemon.pid', 'nonce')
    ).rejects.toThrow('Daemon exited during startup with code 1')
    expect(forkMock).toHaveBeenCalledTimes(2)
  })

  it('never forks twice off win32, where there is no relocated host', async () => {
    const launcher = await takeLauncher()
    forkMock.mockReturnValueOnce(createExitingChild(4001, 1))

    await expect(
      launcher('/fake/socket', '/fake/token', '/fake/daemon.pid', 'nonce')
    ).rejects.toThrow('Daemon exited during startup with code 1')
    expect(forkMock).toHaveBeenCalledTimes(1)
    expect(forkedEntryPaths()).toEqual([INSTALL_DIR_ENTRY])
  })

  it('adopts the endpoint winner instead of retrying when the child stood down', async () => {
    materializeRelocatedDaemonHostMock.mockReturnValue(RELOCATED_HOST)
    const launcher = await takeLauncher()
    forkMock.mockReturnValueOnce(createExitingChild(4001, DAEMON_EXIT_ENDPOINT_OCCUPIED))

    await expect(
      launcher('/fake/socket', '/fake/token', '/fake/daemon.pid', 'nonce')
    ).resolves.toMatchObject({ shutdown: expect.any(Function) })
    expect(forkMock).toHaveBeenCalledTimes(1)
  })
})

// Behavioural test for the corporate agent allowlist at the PTY spawn chokepoints.
//
// The renderer already hides blocked agents from every picker, but hiding is not refusing: a
// keyboard chord bound before the policy landed, devtools, the bundled web client and the runtime's
// own PTY controller (CLI, paired clients, automations, orchestration) all reach a spawn directly.
// These cases prove the refusal happens in main — including for a pane that plans its own launch,
// where the planner, not the caller, names the agent — and that a build with no policy file
// spawns exactly as upstream does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentPaneLaunchRequest } from '../../shared/agent-pane-launch-request'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'
import { setupPtyIpcSuite } from './pty-ipc-test-harness'
import { registerPtyHandlers } from './pty/register-handlers'
import { resetAgentLaunchPanesForTests } from '../agent-launch/agent-launch-pane-attachment'
import type * as EnterprisePolicyFileModule from '../enterprise/enterprise-policy-file'

const policyState = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('electron', () => import('./pty-ipc-mock-registry').then((m) => m.electronModuleMock()))
vi.mock('fs', () => import('./pty-ipc-mock-registry').then((m) => m.fsModuleMock()))
vi.mock('node-pty', () => import('./pty-ipc-mock-registry').then((m) => m.nodePtyModuleMock()))
vi.mock('node:child_process', async (importOriginal) =>
  (await import('./pty-ipc-mock-registry')).childProcessModuleMock(await importOriginal())
)
vi.mock('../opencode/hook-service', () =>
  import('./pty-ipc-mock-registry').then((m) => m.openCodeHookServiceModuleMock())
)
vi.mock('../mimo/hook-service', () =>
  import('./pty-ipc-mock-registry').then((m) => m.mimoHookServiceModuleMock())
)
vi.mock('../agent-hooks/server', () =>
  import('./pty-ipc-mock-registry').then((m) => m.agentHookServerModuleMock())
)
vi.mock('../pi/titlebar-extension-service', () =>
  import('./pty-ipc-mock-registry').then((m) => m.piTitlebarExtensionModuleMock())
)
vi.mock('../pwsh', () => import('./pty-ipc-mock-registry').then((m) => m.pwshModuleMock()))
vi.mock('../wsl', async (importOriginal) =>
  (await import('./pty-ipc-mock-registry')).wslModuleMock(await importOriginal())
)
vi.mock('../telemetry/client', () =>
  import('./pty-ipc-mock-registry').then((m) => m.telemetryClientModuleMock())
)
vi.mock('../telemetry/classify-error', () =>
  import('./pty-ipc-mock-registry').then((m) => m.classifyErrorModuleMock())
)
vi.mock('../cli/linux-terminal-orca-cli-shim', () =>
  import('./pty-ipc-mock-registry').then((m) => m.linuxCliShimModuleMock())
)
vi.mock('../memory/pty-registry', () =>
  import('./pty-ipc-mock-registry').then((m) => m.ptyRegistryModuleMock())
)
vi.mock('../agent-hooks/migration-unsupported-pty-state', () =>
  import('./pty-ipc-mock-registry').then((m) => m.migrationUnsupportedPtyModuleMock())
)
vi.mock('../codex/codex-pane-account-registry', () =>
  import('./pty-ipc-mock-registry').then((m) => m.codexPaneAccountRegistryModuleMock())
)
vi.mock('../codex/codex-state-db-backfill-recovery', () =>
  import('./pty-ipc-mock-registry').then((m) => m.codexBackfillRecoveryModuleMock())
)
vi.mock('../enterprise/enterprise-policy-file', async (importOriginal) => ({
  ...(await importOriginal<typeof EnterprisePolicyFileModule>()),
  getEnterprisePolicy: () => policyState.current
}))

const BLOCKED = /agent_blocked_by_enterprise_policy/
const CODEX_BLOCKED = (): unknown => makeLockdownPolicy({ allowedAgents: ['claude', 'opencode'] })

describe('PTY spawns under the corporate agent allowlist', () => {
  const { handlers, mainWindow, installDaemonTestProvider } = setupPtyIpcSuite()
  const tabId = 'tab-allowlist'
  const leafId = '77777777-7777-4777-8777-777777777777'
  const worktreeId = 'repo-1::/tmp/allowlist'

  beforeEach(() => {
    policyState.current = makeEnterprisePolicy()
  })
  afterEach(() => {
    resetAgentLaunchPanesForTests()
  })

  function register(plan: () => Promise<Record<string, unknown>> = async () => ({ command: 'claude' })) {
    const providerSpawn = vi.fn(async () => ({ id: 'pty-allowlist' }))
    installDaemonTestProvider({ spawn: providerSpawn })
    const runtime = {
      setPtyController: vi.fn(),
      createPreAllocatedTerminalHandle: vi.fn(() => 'term_allowlist'),
      registerPreAllocatedHandleForPty: vi.fn(),
      registerPty: vi.fn(),
      onPtySpawned: vi.fn(),
      onPtyExit: vi.fn(),
      onPtyData: vi.fn(),
      hasLiveTerminalForPaneKey: vi.fn(() => false),
      reportAgentLaunchPaneVerdict: vi.fn(),
      showTerminalWorkspaceLaunchScope: vi.fn(async () => ({
        id: worktreeId,
        path: '/tmp/allowlist',
        connectionId: null,
        repo: null,
        folderWorkspace: null
      })),
      planAgentPaneLaunch: vi.fn(plan),
      getTerminalHandleForPaneKey: vi.fn(() => null),
      closeTerminal: vi.fn(async () => ({}))
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the suite's window double, carrying the members a renderer spawn reaches.
    const window = mainWindow as never
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a runtime carrying only the members these spawns reach.
    registerPtyHandlers(window, runtime as never)
    return { runtime, providerSpawn }
  }

  function spawnAgent(launchAgent: string): Promise<unknown> {
    return Promise.resolve(
      handlers.get('pty:spawn')!(null, {
        cols: 80,
        rows: 24,
        cwd: '/tmp/allowlist',
        command: launchAgent,
        launchAgent,
        worktreeId
      })
    )
  }

  it('refuses a renderer launch for an agent the policy does not list', async () => {
    policyState.current = CODEX_BLOCKED()
    const { providerSpawn } = register()
    await expect(spawnAgent('codex')).rejects.toThrow(BLOCKED)
    expect(providerSpawn).not.toHaveBeenCalled()
  })

  it('still spawns an agent the policy lists', async () => {
    policyState.current = CODEX_BLOCKED()
    const { providerSpawn } = register()
    await expect(spawnAgent('claude')).resolves.toBeTruthy()
    expect(providerSpawn).toHaveBeenCalled()
  })

  // The no-regression half: without an allowlist nothing narrows, which is what a build with no
  // policy file — every non-corporate install — runs.
  it('spawns any agent when no allowlist is configured', async () => {
    const { providerSpawn } = register()
    await expect(spawnAgent('codex')).resolves.toBeTruthy()
    expect(providerSpawn).toHaveBeenCalled()
  })

  // allowedAgents deliberately does not inherit `lockdown`: which CLIs a site standardizes on is a
  // list an administrator has to write out.
  it('does not narrow on the master lockdown switch alone', async () => {
    policyState.current = makeLockdownPolicy()
    const { providerSpawn } = register()
    await expect(spawnAgent('codex')).resolves.toBeTruthy()
    expect(providerSpawn).toHaveBeenCalled()
  })

  // v1.4.226: a pane can plan its own launch (`agentLaunch`); the planner then replaces the
  // caller's `launchAgent`, so the entry check alone would trust a claim the plan overrides.
  it("refuses a pane's own launch when the planned agent is blocked, whatever the caller claims", async () => {
    policyState.current = CODEX_BLOCKED()
    const { runtime, providerSpawn } = register(async () => ({ command: 'codex', launchAgent: 'codex' }))
    const codexButton: AgentPaneLaunchRequest = {
      launch: { agent: 'codex', target: { kind: 'existing', worktree: `id:${worktreeId}` } }
    }
    await expect(
      Promise.resolve(
        handlers.get('pty:spawn')!(null, {
          cols: 80,
          rows: 24,
          cwd: '/tmp/allowlist',
          worktreeId,
          tabId,
          leafId,
          command: '',
          launchAgent: 'claude',
          agentLaunch: codexButton
        })
      )
    ).rejects.toThrow()
    expect(runtime.planAgentPaneLaunch).not.toHaveBeenCalled()
    expect(providerSpawn).not.toHaveBeenCalled()
  })

  it('refuses a blocked agent on the runtime PTY controller too', async () => {
    policyState.current = CODEX_BLOCKED()
    const { runtime, providerSpawn } = register()
    const controller = runtime.setPtyController.mock.calls[0]?.[0] as {
      spawn: (args: Record<string, unknown>) => Promise<unknown>
    }
    await expect(
      controller.spawn({
        cols: 80,
        rows: 24,
        cwd: '/tmp/allowlist',
        command: 'codex',
        launchAgent: 'codex',
        worktreeId
      })
    ).rejects.toThrow(BLOCKED)
    expect(providerSpawn).not.toHaveBeenCalled()
  })
})

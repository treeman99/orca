import { beforeEach, describe, expect, it, vi } from 'vitest'

// Own harness rather than a sibling's: launch-agent-in-new-tab.test.ts is already at the
// max-lines cap, and the fork forbids bumping it.
const mockQueueTabStartupCommand = vi.fn()

const store = {
  settings: {
    agentCmdOverrides: {},
    agentDefaultArgs: {},
    agentDefaultEnv: {},
    activeRuntimeEnvironmentId: null as string | null,
    experimentalNativeChat: true,
    // The state a stale profile is in, and the reason `+ → Claude` opened a chat window.
    openAgentTabsInChatByDefault: true,
    nativeChatSessionOptions: { codex: { model: 'gpt-5-codex' } } as Record<string, unknown>
  },
  repos: [],
  allWorktrees: vi.fn(() => []),
  tabsByWorktree: { 'wt-1': [{ id: 'tab-1' }] },
  openFiles: [] as { id: string; worktreeId: string }[],
  browserTabsByWorktree: {} as Record<string, { id: string }[]>,
  tabBarOrderByWorktree: {} as Record<string, string[]>,
  createTab: vi.fn((..._args: unknown[]) => ({ id: 'tab-1' })),
  queueTabInitialCwd: vi.fn(),
  queueTabStartupCommand: mockQueueTabStartupCommand,
  setActiveTabType: vi.fn(),
  setTabBarOrder: vi.fn()
}

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('@/lib/new-workspace', () => ({ CLIENT_PLATFORM: 'darwin' }))
vi.mock('@/lib/connection-context', () => ({ getConnectionIdFromState: () => null }))
vi.mock('@/lib/native-chat-transcript-readability', () => ({
  isNativeChatTranscriptLocalReadable: () => true
}))
vi.mock('@/runtime/web-runtime-session', () => ({ isWebRuntimeSessionActive: () => false }))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getRuntimeEnvironmentIdForWorktree: () => null
}))
vi.mock('@/components/tab-bar/reconcile-order', () => ({
  reconcileTabOrder: (_stored: unknown, terminalIds: string[]) => terminalIds
}))
vi.mock('@/lib/telemetry', () => ({ track: vi.fn(), tuiAgentToAgentKind: (a: string) => a }))
vi.mock('@/components/native-chat/native-chat-session-option-cache', () => ({
  seedNativeChatAppliedSessionOptions: vi.fn()
}))

// The tab bar's `+` menu offers terminal and chat as two SEPARATE rows — agents are the
// terminal half, bots the chat half. Letting `openAgentTabsInChatByDefault` decide what an
// agent row does is what made "+ → Claude opened a chat window" unexplainable from the menu,
// and a profile that carries the setting across installs keeps reproducing it.
describe('launchAgentInNewTab forceTerminalView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the launch on the terminal even with the chat default on', async () => {
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    launchAgentInNewTab({
      agent: 'codex',
      worktreeId: 'wt-1',
      forceTerminalView: true
    })

    expect(store.createTab.mock.calls.at(-1)?.[3]).not.toHaveProperty('viewMode')
    // Chat session options ride a chat launch; baking them into a command line the caller
    // asked to be a plain terminal would change what actually runs.
    expect(mockQueueTabStartupCommand).toHaveBeenCalledWith(
      'tab-1',
      expect.objectContaining({ command: expect.not.stringContaining('gpt-5-codex') })
    )
  })

  it('still honours the setting without the override', async () => {
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    launchAgentInNewTab({ agent: 'codex', worktreeId: 'wt-1' })

    expect(store.createTab.mock.calls.at(-1)?.[3]).toMatchObject({ viewMode: 'chat' })
  })
})

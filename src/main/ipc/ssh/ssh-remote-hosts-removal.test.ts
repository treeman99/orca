// Fork-owned: this build removes SSH hosts (src/shared/ssh-remote-hosts-removal.ts). v1.4.226
// deleted the SSH relay, so a host runs only through a managed orcad, and this build ships none.
// These cases prove main refuses at the chokepoints every surface reaches — the connect, and the
// add/edit/import that would register a host — and that removing a saved host still works.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SSH_REMOTE_HOSTS_REMOVED_MESSAGE } from '../../../shared/ssh-remote-hosts-removal'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  registry: {
    addTarget: vi.fn(),
    updateTarget: vi.fn(),
    getTarget: vi.fn(() => null),
    importFromSshConfig: vi.fn(() => []),
    listTargets: vi.fn(() => [])
  }
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, handler)
  }
}))
vi.mock('../../ssh/targets/ssh-target-registry', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSshTargetRegistryStore: () => mocks.registry,
  setSshTargetMutations: vi.fn()
}))

const { connectTarget } = await import('./ssh-connect-flow')
const { registerSshTargetCrudHandlers } = await import('./ssh-target-crud-handlers')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
  registerSshTargetCrudHandlers()
})

describe('SSH hosts are removed from this build', () => {
  it('refuses every connect before it touches the target', async () => {
    await expect(connectTarget('ssh-1')).rejects.toThrow(SSH_REMOTE_HOSTS_REMOVED_MESSAGE)
    await expect(connectTarget('ssh-1', { automatic: true })).rejects.toThrow(
      SSH_REMOTE_HOSTS_REMOVED_MESSAGE
    )
    expect(mocks.registry.getTarget).not.toHaveBeenCalled()
  })

  it('refuses to add, edit or import a host', async () => {
    const add = mocks.handlers.get('ssh:addTarget')!
    const update = mocks.handlers.get('ssh:updateTarget')!
    const importConfig = mocks.handlers.get('ssh:importConfig')!

    expect(() =>
      add(null, { target: { label: 'box', host: 'box', port: 22, username: 'me' } })
    ).toThrow(SSH_REMOTE_HOSTS_REMOVED_MESSAGE)
    expect(() => update(null, { id: 'ssh-1', updates: { label: 'renamed' } })).toThrow(
      SSH_REMOTE_HOSTS_REMOVED_MESSAGE
    )
    expect(() => importConfig(null, {})).toThrow(SSH_REMOTE_HOSTS_REMOVED_MESSAGE)
    expect(mocks.registry.addTarget).not.toHaveBeenCalled()
    expect(mocks.registry.updateTarget).not.toHaveBeenCalled()
    expect(mocks.registry.importFromSshConfig).not.toHaveBeenCalled()
  })

  it('still lists saved hosts, so a user can find and remove one', () => {
    expect(mocks.handlers.get('ssh:listTargets')!(null)).toEqual([])
    expect(mocks.handlers.has('ssh:removeTarget')).toBe(true)
  })
})

// v1.4.238 added a plain `ssh` login for a host whose move to its Orca server is blocked. Only a
// connect attempt marks a host blocked and connect is refused above, so this guards the invariant.
describe('plain SSH terminals are removed with SSH hosts', () => {
  it('refuses to open one before it looks the target up or spawns ssh', async () => {
    const { openPlainSshTerminal } =
      await import('../../ssh/plain-ssh-terminal/plain-ssh-terminal-sessions')
    const getTarget = vi.fn(() => ({
      id: 'box',
      label: 'box',
      host: 'box',
      port: 22,
      username: ''
    }))
    const loadPtySpawn = vi.fn()
    const result = await openPlainSshTerminal(
      {
        getTarget,
        isMoveBlocked: () => true,
        findSsh: () => '/usr/bin/ssh',
        mayConfigClaimAlias: () => true,
        loadPtySpawn,
        homeDir: () => '/home/me',
        platform: 'linux'
      } as never,
      { targetId: 'box', cols: 80, rows: 24, owner: 1 },
      { emit: vi.fn() } as never
    )

    expect(result).toEqual({ ok: false, reason: 'unknown-target' })
    expect(getTarget).not.toHaveBeenCalled()
    expect(loadPtySpawn).not.toHaveBeenCalled()
  })
})

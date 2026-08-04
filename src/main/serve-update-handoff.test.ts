import { mkdtempSync, rmSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SERVE_UPDATE_HANDOFF_PATH_ENV,
  getServeUpdateHandoffPath
} from '../shared/serve-update-handoff'

const { appMock, getCanonicalUserDataPathMock } = vi.hoisted(() => ({
  appMock: { getVersion: vi.fn(() => '1.0.51'), quit: vi.fn() },
  getCanonicalUserDataPathMock: vi.fn()
}))

vi.mock('electron', () => ({ app: appMock }))
vi.mock('./persistence', () => ({ getCanonicalUserDataPath: getCanonicalUserDataPathMock }))

describe('serve supervisor handshake', () => {
  let root: string

  beforeEach(() => {
    vi.resetModules()
    appMock.getVersion.mockReturnValue('1.0.51')
    appMock.quit.mockReset()
    root = mkdtempSync(join(tmpdir(), 'orca-serve-handoff-'))
    getCanonicalUserDataPathMock.mockReturnValue(root)
    process.env[SERVE_UPDATE_HANDOFF_PATH_ENV] = getServeUpdateHandoffPath(root)
  })

  afterEach(() => {
    delete process.env[SERVE_UPDATE_HANDOFF_PATH_ENV]
    rmSync(root, { recursive: true, force: true })
  })

  it.runIf(process.platform === 'darwin')(
    'quits a supervised serve child when its CLI parent is lost',
    async () => {
      const parent = new EventEmitter()
      const { installServeSupervisorDisconnectQuit } = await import('./serve-update-handoff')

      const removeListener = installServeSupervisorDisconnectQuit(true, parent)
      parent.emit('disconnect')

      expect(appMock.quit).toHaveBeenCalledOnce()
      removeListener()
    }
  )

  it('ignores a handoff path outside the canonical user-data directory', async () => {
    process.env[SERVE_UPDATE_HANDOFF_PATH_ENV] = join(root, '..', 'untrusted.json')
    const parent = new EventEmitter()
    const { installServeSupervisorDisconnectQuit } = await import('./serve-update-handoff')

    installServeSupervisorDisconnectQuit(true, parent)
    parent.emit('disconnect')

    expect(appMock.quit).not.toHaveBeenCalled()
  })

  // Fork guard: main no longer writes an install-requested handoff. If an
  // upstream rebase reintroduces the updater's write path, this turns red.
  it('exports no update-install handoff writer', async () => {
    const moduleExports = await import('./serve-update-handoff')

    expect(Object.keys(moduleExports).sort()).toEqual([
      'installServeSupervisorDisconnectQuit',
      'notifyServeSupervisorReady'
    ])
  })
})

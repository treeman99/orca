import { afterEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import type * as NodeFs from 'node:fs'

const { appMock, existsSyncMock } = vi.hoisted(() => ({
  appMock: { isPackaged: false, getAppPath: () => '/app/root', getVersion: () => '9.9.9-test' },
  existsSyncMock: vi.fn(() => true)
}))

vi.mock('electron', () => ({ app: appMock, ipcMain: { handle: vi.fn() } }))
// Why: this module tree also reads fs constants, so only the launcher probe is replaced.
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeFs>()),
  existsSync: existsSyncMock
}))

import { resolveSkillUpdateCliInvocation } from './skills'

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
const originalResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
const RESOURCES = join('/', 'Applications', 'Orca.app', 'Contents', 'Resources')

/** Vitest runs plain node, which has no `process.resourcesPath`; Electron sets it. */
function packagedAs(platform: NodeJS.Platform): void {
  appMock.isPackaged = true
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  Object.defineProperty(process, 'resourcesPath', { value: RESOURCES, configurable: true })
}

afterEach(() => {
  appMock.isPackaged = false
  existsSyncMock.mockReset()
  existsSyncMock.mockReturnValue(true)
  if (originalPlatform) {
    Object.defineProperty(process, 'platform', originalPlatform)
  }
  if (originalResourcesPath) {
    Object.defineProperty(process, 'resourcesPath', originalResourcesPath)
  } else {
    delete (process as { resourcesPath?: string }).resourcesPath
  }
})

describe('resolveSkillUpdateCliInvocation', () => {
  // Why: `out/cli/**` is asarUnpacked precisely because the compiled CLI resolves its
  // imports through Node's normal lookup. Naming the in-asar entry would run it from the
  // one layout that is meant to avoid, so a packaged build must use the shipped launcher.
  it('runs the bundled launcher in a packaged build', () => {
    packagedAs('darwin')

    const invocation = resolveSkillUpdateCliInvocation()

    expect(invocation.command).toBe(join(RESOURCES, 'bin', 'orca'))
    expect(invocation.baseArgs).toEqual([])
    expect(invocation.env.ELECTRON_RUN_AS_NODE).toBeUndefined()
  })

  it('runs the CLI entry as node in a dev build', () => {
    const invocation = resolveSkillUpdateCliInvocation()

    expect(invocation.command).toBe(process.execPath)
    expect(invocation.baseArgs).toEqual([join('/app/root', 'out', 'cli', 'index.js')])
    expect(invocation.env.ELECTRON_RUN_AS_NODE).toBe('1')
  })

  it('falls back to the CLI entry when a packaged build has no launcher', () => {
    packagedAs('linux')
    existsSyncMock.mockReturnValue(false)

    const invocation = resolveSkillUpdateCliInvocation()

    expect(invocation.command).toBe(process.execPath)
    expect(invocation.baseArgs).toEqual([join('/app/root', 'out', 'cli', 'index.js')])
  })
})

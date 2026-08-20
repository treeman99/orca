// Fork-owned: proves disableSpellcheck reaches Chromium's webPreferences, for the main
// window AND for guest webviews (which run in their own session). Kept in its own file so
// an upstream split of the createMainWindow suite cannot carry the gate away.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getEnterprisePolicyMock } = vi.hoisted(() => ({ getEnterprisePolicyMock: vi.fn() }))

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))
vi.mock('electron', async () =>
  (await import('./createMainWindow-test-harness')).electronModuleMock()
)
vi.mock('@electron-toolkit/utils', async () =>
  (await import('./createMainWindow-test-harness')).electronToolkitUtilsMock()
)
vi.mock('./macos-tahoe-release', async () =>
  (await import('./createMainWindow-test-harness')).macosTahoeReleaseMock()
)
vi.mock('../app-icon', async () => (await import('./createMainWindow-test-harness')).appIconMock())
vi.mock('../browser/browser-manager', async () =>
  (await import('./createMainWindow-test-harness')).browserManagerMock()
)

import { createMainWindow } from './createMainWindow'
import { browserWindowMock, resetMainWindowMocks } from './createMainWindow-test-harness'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

describe('createMainWindow spellcheck under enterprise policy', () => {
  beforeEach(() => {
    resetMainWindowMocks()
    getEnterprisePolicyMock.mockReset()
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
  })

  it('turns Chromium spellcheck off under lockdown so no dictionary CDN is contacted', () => {
    let webContentsHandlers: Record<string, (...args: any[]) => void> = {}
    const stubBrowserWindowInstance = (): void => {
      webContentsHandlers = {}
      const webContents = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          webContentsHandlers[event] = handler
        }),
        setZoomLevel: vi.fn(),
        setBackgroundThrottling: vi.fn(),
        invalidate: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        send: vi.fn(),
        isDevToolsOpened: vi.fn(),
        openDevTools: vi.fn(),
        closeDevTools: vi.fn()
      }
      const browserWindowInstance = {
        webContents,
        on: vi.fn(),
        isDestroyed: vi.fn(() => false),
        isMaximized: vi.fn(() => false),
        isFullScreen: vi.fn(() => false),
        getSize: vi.fn(() => [1200, 800]),
        setSize: vi.fn(),
        setWindowButtonPosition: vi.fn(),
        maximize: vi.fn(),
        show: vi.fn(),
        loadFile: vi.fn(),
        loadURL: vi.fn()
      }
      browserWindowMock.mockImplementation(function () {
        return browserWindowInstance
      })
    }

    // Guests run in their own session, so assert the guest preferences too.
    const attachGuestSpellcheck = (): unknown => {
      const guestPreferences: Record<string, unknown> = { partition: 'persist:orca-browser' }
      webContentsHandlers['will-attach-webview'](
        { preventDefault: vi.fn() } as never,
        guestPreferences as never,
        { src: 'https://example.com/' } as never
      )
      return guestPreferences.spellcheck
    }

    const mainWindowSpellcheck = (): unknown => {
      const options = browserWindowMock.mock.calls[0]?.[0] as
        | { webPreferences: { spellcheck?: unknown } }
        | undefined
      return options?.webPreferences.spellcheck
    }

    stubBrowserWindowInstance()
    createMainWindow(null)
    expect(mainWindowSpellcheck()).toBe(true)
    expect(attachGuestSpellcheck()).toBe(true)

    browserWindowMock.mockReset()
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    stubBrowserWindowInstance()
    createMainWindow(null)
    expect(mainWindowSpellcheck()).toBe(false)
    expect(attachGuestSpellcheck()).toBe(false)

    // An admin may opt spellcheck back in without lifting the rest of lockdown.
    browserWindowMock.mockReset()
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy({ disableSpellcheck: false }))
    stubBrowserWindowInstance()
    createMainWindow(null)
    expect(mainWindowSpellcheck()).toBe(true)
    expect(attachGuestSpellcheck()).toBe(true)
  })
})

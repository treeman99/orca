import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import type { Store } from '../persistence'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'
import {
  installTabPopoutBoundsPersistence,
  resolveTabPopoutBounds,
  TAB_POPOUT_DEFAULT_HEIGHT,
  TAB_POPOUT_DEFAULT_WIDTH,
  TAB_POPOUT_MIN_HEIGHT,
  TAB_POPOUT_MIN_WIDTH
} from './tab-popout-window-bounds'

const TAB_POPOUT_PARTITION = 'orca-tab-popout'

/**
 * Build one detached-tab window. Reuses the dashboard pop-out's security
 * profile: sandboxed, isolated session, no webview guests, navigation and
 * permissions denied. `onClosed` runs once the OS window is gone.
 */
export function createTabPopoutWindow(args: {
  store: Store | null
  windowKey: string
  title: string
  cascadeIndex: number
  onClosed: () => void
}): BrowserWindow {
  const savedBounds = resolveTabPopoutBounds(args.store, args.cascadeIndex)
  const window = new BrowserWindow({
    width: savedBounds?.width ?? TAB_POPOUT_DEFAULT_WIDTH,
    height: savedBounds?.height ?? TAB_POPOUT_DEFAULT_HEIGHT,
    ...(savedBounds ? { x: savedBounds.x, y: savedBounds.y } : {}),
    minWidth: TAB_POPOUT_MIN_WIDTH,
    minHeight: TAB_POPOUT_MIN_HEIGHT,
    title: args.title,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    // Why: native frame — the renderer draws only a tab strip, not window chrome,
    // and the OS frame keeps the window movable across displays on every platform.
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      // Why: Chromium shares zoom by origin; an isolated session keeps pop-out zoom out of the main window.
      partition: TAB_POPOUT_PARTITION,
      // Why: an isolated session does not inherit the main window's spellcheck gate, so lockdown would still hit the hunspell CDN.
      spellcheck: !getEnterprisePolicy().disableSpellcheck,
      // Why: terminal panes are plain DOM; keep the guest-embedding surface off.
      webviewTag: false
    }
  })

  installPrivilegedWindowNavigationPolicy(window.webContents)
  // Why: isolated sessions do not inherit the main session's deny-by-default permission policy.
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false)
  )
  window.webContents.session.setPermissionCheckHandler(() => false)

  window.webContents.on('dom-ready', () => {
    if (!window.isDestroyed()) {
      window.webContents.setZoomLevel(args.store?.getUI().uiZoomLevel ?? 0)
    }
  })

  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      window.show()
    }
  })

  const bounds = installTabPopoutBoundsPersistence(window, args.store)
  window.on('close', bounds.freeze)
  app.on('before-quit', bounds.freeze)
  window.on('closed', () => {
    app.removeListener('before-quit', bounds.freeze)
    args.onClosed()
  })

  const search = `win=${encodeURIComponent(args.windowKey)}`
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/popout.html?${search}`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/popout.html'), { search })
  }
  return window
}

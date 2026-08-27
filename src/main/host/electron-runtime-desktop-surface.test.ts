import { beforeEach, describe, expect, it, vi } from 'vitest'

const windows = vi.hoisted(() => ({ focused: null as unknown, all: [] as unknown[] }))
type MessageBoxOptions = { defaultId: number; cancelId: number; detail: string }
const showMessageBox = vi.hoisted(() =>
  vi.fn(async (_window: unknown, _options: unknown) => ({ response: 0, checkboxChecked: false }))
)

vi.mock('electron', () => ({
  BrowserWindow: {
    getFocusedWindow: () => windows.focused,
    getAllWindows: () => windows.all,
    fromId: () => null
  },
  dialog: { showMessageBox },
  ipcMain: { on: () => {}, removeListener: () => {} },
  Notification: Object.assign(
    function () {
      return { show: () => {} }
    },
    { isSupported: () => false }
  )
}))

vi.mock('../i18n/main-i18n', () => ({
  translateMain: (_key: string, fallback: string) => fallback
}))

import { electronRuntimeDesktopSurface } from './electron-runtime-desktop-surface'

describe('electronRuntimeDesktopSurface.confirmComputerUseAction', () => {
  beforeEach(() => {
    windows.focused = null
    windows.all = []
    showMessageBox.mockClear()
  })

  // Fails closed: a window-less desktop has nobody to ask, and the caller reads
  // 'no-window' as a refusal.
  it('reports no-window without showing a dialog when no window exists', async () => {
    await expect(
      electronRuntimeDesktopSurface.confirmComputerUseAction('Click Slack')
    ).resolves.toBe('no-window')
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  // Esc and the window close button both report cancelId, so a dismissed prompt must
  // take the Deny path.
  it('defaults to Deny and treats dismissal as a refusal', async () => {
    windows.all = [{}]
    await expect(
      electronRuntimeDesktopSurface.confirmComputerUseAction('Click Slack')
    ).resolves.toBe('denied')
    const options = showMessageBox.mock.calls[0]?.[1] as MessageBoxOptions
    expect(options.defaultId).toBe(0)
    expect(options.cancelId).toBe(0)
    expect(options.detail).toBe('Click Slack')
  })

  it('allows only when the second button is chosen', async () => {
    windows.all = [{}]
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false })
    await expect(
      electronRuntimeDesktopSurface.confirmComputerUseAction('Click Slack')
    ).resolves.toBe('allowed')
  })
})

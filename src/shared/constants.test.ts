import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from './constants'
import {
  getDefaultPrimarySelectionMiddleClickPaste,
  getDefaultTerminalRightClickToPaste
} from './terminal-platform-defaults'

describe('getDefaultSettings', () => {
  it('uses platform-consistent separators for the default workspace directory', () => {
    expect(getDefaultSettings('/Users/alice').workspaceDir).toBe('/Users/alice/orca/workspaces')
    expect(getDefaultSettings('C:\\Users\\alice').workspaceDir).toBe(
      'C:\\Users\\alice\\orca\\workspaces'
    )
  })

  // Fork gate: worker tabs pile up when the coordinator forgets to release them, so this
  // ships on. An upstream rebase resolving it back to false is silent — nothing else fails.
  it('closes a finished worker tab by default, but never auto-splits without opting in', () => {
    expect(getDefaultSettings('/tmp').autoCloseCompletedOrchestrationWorkerTabs).toBe(true)
    expect(getDefaultSettings('/tmp').autoSplitOrchestrationWorkerPanes).toBe(false)
  })

  it('asks before closing terminals with running processes by default', () => {
    expect(getDefaultSettings('/tmp').skipCloseTerminalWithRunningProcessConfirm).toBe(false)
  })
})

describe('getDefaultPrimarySelectionMiddleClickPaste', () => {
  it('enables primary selection paste on Linux by default', () => {
    expect(getDefaultPrimarySelectionMiddleClickPaste('linux')).toBe(true)
  })

  it('enables primary selection paste on macOS by default', () => {
    expect(getDefaultPrimarySelectionMiddleClickPaste('darwin')).toBe(true)
  })

  it('leaves primary selection paste opt-in on Windows', () => {
    expect(getDefaultPrimarySelectionMiddleClickPaste('win32')).toBe(false)
  })
})

describe('getDefaultTerminalRightClickToPaste', () => {
  it('defaults on only for Windows', () => {
    expect(getDefaultTerminalRightClickToPaste('win32')).toBe(true)
    expect(getDefaultTerminalRightClickToPaste('darwin')).toBe(false)
    expect(getDefaultTerminalRightClickToPaste('linux')).toBe(false)
  })
})

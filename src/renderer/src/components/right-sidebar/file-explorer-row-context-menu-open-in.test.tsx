import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileExplorerRowContextMenu } from './file-explorer-row-context-menu'
import type { TreeNode } from './file-explorer-types'

type ItemProps = { onSelect?: () => void; disabled?: boolean; children?: React.ReactNode }

const { items, mockSettings, openInExternalEditorMock } = vi.hoisted(() => ({
  items: { list: [] as ItemProps[] },
  mockSettings: {
    activeRuntimeEnvironmentId: null as string | null,
    openInApplications: [{ id: 'vscode', label: 'VS Code', command: 'code' }]
  },
  openInExternalEditorMock: vi.fn()
}))

vi.mock('@/components/ui/context-menu', async () => {
  const React_ = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React_.createElement(React_.Fragment, null, children)

  return {
    ContextMenuContent: passthrough,
    ContextMenuItem: (props: ItemProps) => {
      items.list.push(props)
      return React_.createElement(React_.Fragment, null, props.children)
    },
    ContextMenuSeparator: () => null,
    ContextMenuShortcut: passthrough,
    ContextMenuSub: passthrough,
    ContextMenuSubContent: passthrough,
    ContextMenuSubTrigger: passthrough
  }
})

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: { settings: typeof mockSettings; activeWorktreeId: null }) => unknown) =>
      selector({ settings: mockSettings, activeWorktreeId: null }),
    { getState: () => ({ settings: mockSettings, worktreesByRepo: {}, repos: [] }) }
  )
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutLabel: () => 'Unassigned'
}))

vi.mock('@/lib/file-preview', () => ({
  openFileInBrowserTab: vi.fn()
}))

vi.mock('./file-explorer-row-file-transfer', () => ({
  copyFileToOsClipboard: vi.fn(),
  downloadRemoteFile: vi.fn()
}))

vi.mock('@/lib/open-in-app-catalog', () => ({
  OpenInApplicationIcon: () => null
}))

vi.mock('@/lib/local-file-manager-label', () => ({
  getLocalFileManagerLabel: () => 'Finder'
}))

const fileNode: TreeNode = {
  name: 'example.ts',
  path: '/repo/src/example.ts',
  relativePath: 'src/example.ts',
  isDirectory: false,
  depth: 1
}

function renderMenu(overrides: { connectionId?: string | null } = {}): void {
  renderToStaticMarkup(
    <FileExplorerRowContextMenu
      node={fileNode}
      isExpanded={false}
      deleteShortcutLabel="⌫"
      connectionId={overrides.connectionId ?? null}
      canOpenInOrcaBrowser={false}
      canCollapseFolderSubtree={false}
      targetDir="/repo/src"
      targetDepth={1}
      selectionSize={1}
      canAddAsProject={false}
      onViewFile={vi.fn()}
      onCopyPaths={vi.fn()}
      onStartNew={vi.fn()}
      onStartRename={vi.fn()}
      onDuplicate={vi.fn()}
      onAddFolderAsProject={vi.fn()}
      onOpenInTerminal={vi.fn()}
      onRequestDelete={vi.fn()}
      onCollapseFolderSubtree={vi.fn()}
      onFindInFolder={vi.fn()}
    />
  )
}

/** Menu labels live inside nested components; render them and drop the markup. */
function itemText(children: React.ReactNode): string {
  return renderToStaticMarkup(<>{children}</>).replace(/<[^>]*>/g, '')
}

function findItem(label: string): ItemProps | undefined {
  return items.list.find((item) => itemText(item.children) === label)
}

describe('FileExplorerRowContextMenu open-in submenu', () => {
  beforeEach(() => {
    items.list = []
    mockSettings.activeRuntimeEnvironmentId = null
    mockSettings.openInApplications = [{ id: 'vscode', label: 'VS Code', command: 'code' }]
    openInExternalEditorMock.mockReset()
    openInExternalEditorMock.mockResolvedValue({ ok: true })
    vi.stubGlobal('window', {
      api: { shell: { openInExternalEditor: openInExternalEditorMock } }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders every configured launcher plus the local file manager', () => {
    mockSettings.openInApplications = [
      { id: 'vscode', label: 'VS Code', command: 'code' },
      { id: 'cursor', label: 'Cursor', command: 'cursor' }
    ]

    renderMenu()

    expect(findItem('VS Code')).toBeDefined()
    expect(findItem('Cursor')).toBeDefined()
    expect(findItem('Finder')).toBeDefined()
    expect(findItem('Customize apps...')).toBeDefined()
  })

  it('opens the row path with the launcher command', async () => {
    renderMenu()

    const vsCodeItem = findItem('VS Code')
    expect(vsCodeItem?.disabled).toBe(false)
    vsCodeItem?.onSelect?.()
    await Promise.resolve()

    expect(openInExternalEditorMock).toHaveBeenCalledWith({
      path: '/repo/src/example.ts',
      command: 'code',
      connectionId: null
    })
  })

  it('keeps VS Code available for an SSH workspace and marks it remote', async () => {
    renderMenu({ connectionId: 'ssh-1' })

    const vsCodeItem = findItem('VS CodeRemote SSH')
    expect(vsCodeItem?.disabled).toBe(false)
    vsCodeItem?.onSelect?.()
    await Promise.resolve()

    expect(openInExternalEditorMock).toHaveBeenCalledWith({
      path: '/repo/src/example.ts',
      command: 'code',
      connectionId: 'ssh-1'
    })
  })

  it('disables local launchers while a remote runtime is active', () => {
    mockSettings.activeRuntimeEnvironmentId = 'runtime-1'

    renderMenu()

    expect(findItem('VS CodeLocal only')?.disabled).toBe(true)
    expect(findItem('FinderLocal only')?.disabled).toBe(true)
    expect(openInExternalEditorMock).not.toHaveBeenCalled()
  })
})

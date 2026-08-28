import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '../../store/slices/editor'

const shortcutLabelMock = vi.hoisted(() => vi.fn())
const { openInExternalEditorMock, openPathMock, mockSettings } = vi.hoisted(() => ({
  openInExternalEditorMock: vi.fn(),
  openPathMock: vi.fn(),
  mockSettings: {
    activeRuntimeEnvironmentId: null as string | null,
    openInApplications: [{ id: 'vscode', label: 'VS Code', command: 'code' }]
  }
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: function DropdownMenu(props: { children?: unknown }) {
    return { type: 'DropdownMenu', props }
  },
  DropdownMenuContent: function DropdownMenuContent(props: { children?: unknown }) {
    return { type: 'DropdownMenuContent', props }
  },
  DropdownMenuItem: function DropdownMenuItem(props: { children?: unknown }) {
    return { type: 'DropdownMenuItem', props }
  },
  DropdownMenuSeparator: function DropdownMenuSeparator() {
    return { type: 'DropdownMenuSeparator', props: {} }
  },
  DropdownMenuShortcut: function DropdownMenuShortcut(props: { children?: unknown }) {
    return { type: 'DropdownMenuShortcut', props }
  },
  DropdownMenuLabel: function DropdownMenuLabel(props: { children?: unknown }) {
    return { type: 'DropdownMenuLabel', props }
  },
  DropdownMenuSub: function DropdownMenuSub(props: { children?: unknown }) {
    return { type: 'DropdownMenuSub', props }
  },
  DropdownMenuSubContent: function DropdownMenuSubContent(props: { children?: unknown }) {
    return { type: 'DropdownMenuSubContent', props }
  },
  DropdownMenuSubTrigger: function DropdownMenuSubTrigger(props: { children?: unknown }) {
    return { type: 'DropdownMenuSubTrigger', props }
  },
  DropdownMenuTrigger: function DropdownMenuTrigger(props: { children?: unknown }) {
    return { type: 'DropdownMenuTrigger', props }
  }
}))

vi.mock('lucide-react', () => ({
  SquareArrowOutUpRight: () => null,
  ArrowDown: function ArrowDown(props: Record<string, unknown>) {
    return { type: 'ArrowDown', props }
  },
  ArrowLeft: function ArrowLeft(props: Record<string, unknown>) {
    return { type: 'ArrowLeft', props }
  },
  ArrowRight: function ArrowRight(props: Record<string, unknown>) {
    return { type: 'ArrowRight', props }
  },
  ArrowUp: function ArrowUp(props: Record<string, unknown>) {
    return { type: 'ArrowUp', props }
  },
  Copy: function Copy(props: Record<string, unknown>) {
    return { type: 'Copy', props }
  },
  CopyX: function CopyX(props: Record<string, unknown>) {
    return { type: 'CopyX', props }
  },
  ExternalLink: function ExternalLink(props: Record<string, unknown>) {
    return { type: 'ExternalLink', props }
  },
  Eye: function Eye(props: Record<string, unknown>) {
    return { type: 'Eye', props }
  },
  FolderOpen: function FolderOpen(props: Record<string, unknown>) {
    return { type: 'FolderOpen', props }
  },
  Settings2: function Settings2(props: Record<string, unknown>) {
    return { type: 'Settings2', props }
  },
  ListX: function ListX(props: Record<string, unknown>) {
    return { type: 'ListX', props }
  },
  PanelLeftClose: function PanelLeftClose(props: Record<string, unknown>) {
    return { type: 'PanelLeftClose', props }
  },
  PanelRightClose: function PanelRightClose(props: Record<string, unknown>) {
    return { type: 'PanelRightClose', props }
  },
  Columns2: function Columns2(props: Record<string, unknown>) {
    return { type: 'Columns2', props }
  },
  Rows2: function Rows2(props: Record<string, unknown>) {
    return { type: 'Rows2', props }
  },
  Pencil: function Pencil(props: Record<string, unknown>) {
    return { type: 'Pencil', props }
  },
  Pin: function Pin(props: Record<string, unknown>) {
    return { type: 'Pin', props }
  },
  PinOff: function PinOff(props: Record<string, unknown>) {
    return { type: 'PinOff', props }
  },
  X: function X(props: Record<string, unknown>) {
    return { type: 'X', props }
  }
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

// Why: the menu reads live shortcut bindings; stub them to fixed labels so
// the test asserts each assigned action surfaces its own shortcut chip.
vi.mock('@/hooks/useShortcutLabel', () => ({
  useOptionalShortcutLabel: shortcutLabelMock
}))

function mockStoreState(): {
  settings: Record<string, unknown>
  unifiedTabsByWorktree: Record<string, unknown[]>
  groupsByWorktree: Record<string, unknown[]>
} {
  return {
    settings: mockSettings,
    unifiedTabsByWorktree: {
      'wt-1': [{ id: 'tab-1', groupId: 'group-1' }]
    },
    groupsByWorktree: {
      'wt-1': [{ id: 'group-1', tabOrder: ['tab-1', 'tab-2'] }]
    }
  }
}

const useAppStoreMock = Object.assign(
  (selector: (state: ReturnType<typeof mockStoreState>) => unknown) => selector(mockStoreState()),
  { getState: mockStoreState }
)

vi.mock('@/store', () => ({
  useAppStore: useAppStoreMock
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() }
}))

vi.mock('@/lib/open-in-app-catalog', () => ({
  OpenInApplicationIcon: () => null
}))

vi.mock('@/lib/local-path-open-guard', async () => ({
  ...(await vi.importActual('@/lib/local-path-open-guard')),
  showLocalPathOpenBlockedToast: vi.fn()
}))

// Why: kept real so the "Open in" submenu can be asserted against the same
// runtime-owner verdict the sibling "Reveal in Finder" item already uses.

type ReactElementLike = {
  type: unknown
  props: Record<string, unknown>
}

function expandNode(node: unknown): unknown {
  if (node == null || typeof node === 'string' || typeof node === 'number') {
    return node
  }
  if (Array.isArray(node)) {
    return node.map(expandNode)
  }
  const el = node as ReactElementLike
  if (typeof el.type === 'function') {
    return expandNode((el.type as (props: unknown) => unknown)(el.props))
  }
  return {
    ...el,
    props: {
      ...el.props,
      children: expandNode(el.props?.children)
    }
  }
}

function findElementsByType(node: unknown, typeName: string): ReactElementLike[] {
  const results: ReactElementLike[] = []
  const visit = (current: unknown): void => {
    if (current == null || typeof current === 'string' || typeof current === 'number') {
      return
    }
    if (Array.isArray(current)) {
      for (const child of current) {
        visit(child)
      }
      return
    }
    const el = current as ReactElementLike
    if (el.type === typeName) {
      results.push(el)
    }
    visit(el.props?.children)
  }
  visit(node)
  return results
}

function extractText(node: unknown): string {
  if (node == null) {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join('')
  }
  const el = node as ReactElementLike
  return el.props && 'children' in el.props ? extractText(el.props.children) : ''
}

async function renderMenu(
  overrides: {
    repoConnectionId?: string | null
    fileRuntimeEnvironmentId?: string | null
    filePath?: string
    mode?: OpenFile['mode']
    diffSource?: OpenFile['diffSource']
  } = {}
): Promise<unknown> {
  const module = await import('./EditorFileTabContextMenu')
  return module.EditorFileTabContextMenu({
    open: true,
    menuPoint: { x: 0, y: 0 },
    file: {
      id: 'file-1',
      tabId: 'tab-1',
      filePath: overrides.filePath ?? '/repo/foo.ts',
      relativePath: 'foo.ts',
      worktreeId: 'wt-1',
      runtimeEnvironmentId: overrides.fileRuntimeEnvironmentId ?? null,
      language: 'typescript',
      isDirty: false,
      mode: overrides.mode ?? 'edit',
      diffSource: overrides.diffSource
    },
    unifiedTabId: 'tab-1',
    groupId: 'group-1',
    isPinned: false,
    isRenaming: false,
    hasTabsToRight: false,
    hasTabsToLeft: false,
    tabCount: 1,
    canRename: true,
    canShowMarkdownPreview: false,
    resolvedLanguage: 'typescript',
    repoConnectionId: overrides.repoConnectionId ?? null,
    skipMenuFocusRestoreRef: { current: false },
    onOpenChange: vi.fn(),
    onActivate: vi.fn(),
    onOpenRenameInput: vi.fn(),
    onTogglePin: vi.fn(),
    onClose: vi.fn(),
    onCloseOthers: vi.fn(),
    onCloseAll: vi.fn(),
    onCloseToRight: vi.fn(),
    onCloseToLeft: vi.fn(),
    onOpenMarkdownPreview: vi.fn()
  })
}

function assignedShortcutLabel(actionId: string): string | null {
  switch (actionId) {
    case 'tab.rename':
      return '⌘R'
    case 'tab.close':
      return '⌘W'
    case 'tab.closeAll':
      return '⌘⌥W'
    default:
      return null
  }
}

describe('EditorFileTabContextMenu close-all shortcut', () => {
  beforeEach(() => {
    vi.resetModules()
    shortcutLabelMock.mockImplementation(assignedShortcutLabel)
    vi.stubGlobal('navigator', { userAgent: 'Mac' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders assigned shortcuts next to Rename, Close, and Close All Editor Tabs', async () => {
    const tree = expandNode(await renderMenu())
    const menuItems = findElementsByType(tree, 'DropdownMenuItem')

    const renameItem = menuItems.find((item) => extractText(item.props.children).includes('Rename'))
    const closeItem = menuItems.find((item) => extractText(item.props.children) === 'Close⌘W')
    const closeAllItem = menuItems.find((item) =>
      extractText(item.props.children).includes('Close All Editor Tabs')
    )

    expect(renameItem).toBeTruthy()
    expect(closeItem).toBeTruthy()
    expect(closeAllItem).toBeTruthy()

    const shortcutExpectations: [ReactElementLike | undefined, string][] = [
      [renameItem, '⌘R'],
      [closeItem, '⌘W'],
      [closeAllItem, '⌘⌥W']
    ]

    for (const [item, expectedLabel] of shortcutExpectations) {
      const shortcut = findElementsByType(item, 'DropdownMenuShortcut')
      expect(shortcut).toHaveLength(1)
      expect(extractText(shortcut[0].props.children)).toBe(expectedLabel)
    }

    expect(findElementsByType(tree, 'DropdownMenuShortcut')).toHaveLength(3)
  })

  it('renders Close Others and both directional close items', async () => {
    const tree = expandNode(await renderMenu())
    const labels = findElementsByType(tree, 'DropdownMenuItem').map((item) =>
      extractText(item.props.children)
    )

    expect(labels).toContain('Close Others')
    expect(labels.some((label) => label.includes('Close Tabs To The Right'))).toBe(true)
    expect(labels.some((label) => label.includes('Close Tabs To The Left'))).toBe(true)
  })

  it('hides the shortcut chip when close-all is unassigned', async () => {
    shortcutLabelMock.mockReturnValue(null)

    const tree = expandNode(await renderMenu())

    const closeAllItem = findElementsByType(tree, 'DropdownMenuItem').find((item) =>
      extractText(item.props.children).includes('Close All Editor Tabs')
    )

    expect(closeAllItem).toBeTruthy()
    expect(findElementsByType(closeAllItem, 'DropdownMenuShortcut')).toHaveLength(0)
    expect(findElementsByType(tree, 'DropdownMenuShortcut')).toHaveLength(0)
  })
})

describe('EditorFileTabContextMenu open-in submenu', () => {
  beforeEach(() => {
    vi.resetModules()
    shortcutLabelMock.mockReturnValue(null)
    mockSettings.activeRuntimeEnvironmentId = null
    mockSettings.openInApplications = [{ id: 'vscode', label: 'VS Code', command: 'code' }]
    openInExternalEditorMock.mockReset()
    openInExternalEditorMock.mockResolvedValue({ ok: true })
    vi.stubGlobal('navigator', { userAgent: 'Mac' })
    vi.stubGlobal('window', {
      api: {
        shell: { openInExternalEditor: openInExternalEditorMock },
        ui: { writeClipboardText: vi.fn() }
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function findOpenInItem(tree: unknown, label: string): ReactElementLike | undefined {
    return findElementsByType(tree, 'DropdownMenuItem').find(
      (item) => extractText(item.props.children) === label
    )
  }

  it('renders every configured launcher plus the local file manager', async () => {
    mockSettings.openInApplications = [
      { id: 'vscode', label: 'VS Code', command: 'code' },
      { id: 'cursor', label: 'Cursor', command: 'cursor' }
    ]

    const tree = expandNode(await renderMenu())

    expect(findOpenInItem(tree, 'VS Code')).toBeTruthy()
    expect(findOpenInItem(tree, 'Cursor')).toBeTruthy()
    expect(findOpenInItem(tree, 'Finder')).toBeTruthy()
    expect(findOpenInItem(tree, 'Customize apps...')).toBeTruthy()
  })

  it('opens the tab file path with the launcher command', async () => {
    const tree = expandNode(await renderMenu())

    const vsCodeItem = findOpenInItem(tree, 'VS Code')
    expect(vsCodeItem?.props.disabled).toBe(false)
    const onSelect = vsCodeItem?.props.onSelect as (() => void) | undefined
    onSelect?.()
    await Promise.resolve()

    expect(openInExternalEditorMock).toHaveBeenCalledWith({
      path: '/repo/foo.ts',
      command: 'code',
      connectionId: null
    })
  })

  it('keeps VS Code available for an SSH repo and marks it remote', async () => {
    const tree = expandNode(await renderMenu({ repoConnectionId: 'ssh-1' }))

    const vsCodeItem = findOpenInItem(tree, 'VS CodeRemote SSH')
    expect(vsCodeItem?.props.disabled).toBe(false)
    const onSelect = vsCodeItem?.props.onSelect as (() => void) | undefined
    onSelect?.()
    await Promise.resolve()

    expect(openInExternalEditorMock).toHaveBeenCalledWith({
      path: '/repo/foo.ts',
      command: 'code',
      connectionId: 'ssh-1'
    })
  })

  it('disables local launchers for a file owned by another runtime', async () => {
    const tree = expandNode(await renderMenu({ fileRuntimeEnvironmentId: 'runtime-1' }))

    expect(findOpenInItem(tree, 'VS CodeLocal only')?.props.disabled).toBe(true)
    expect(findOpenInItem(tree, 'FinderLocal only')?.props.disabled).toBe(true)
    expect(openInExternalEditorMock).not.toHaveBeenCalled()
  })
})

describe('EditorFileTabContextMenu open-in runtime owner', () => {
  beforeEach(() => {
    vi.resetModules()
    shortcutLabelMock.mockReturnValue(null)
    mockSettings.activeRuntimeEnvironmentId = null
    mockSettings.openInApplications = [{ id: 'vscode', label: 'VS Code', command: 'code' }]
    openInExternalEditorMock.mockReset()
    openInExternalEditorMock.mockResolvedValue({ ok: true })
    openPathMock.mockReset()
    vi.stubGlobal('navigator', { userAgent: 'Mac' })
    vi.stubGlobal('window', {
      api: {
        shell: { openInExternalEditor: openInExternalEditorMock, openPath: openPathMock },
        ui: { writeClipboardText: vi.fn() }
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function findItem(tree: unknown, label: string): ReactElementLike | undefined {
    return findElementsByType(tree, 'DropdownMenuItem').find(
      (item) => extractText(item.props.children) === label
    )
  }

  // Why: settingsForRuntimeOwner treats an explicit null owner as local, so a local
  // file stays openable while a remote runtime is active. Reveal in Finder already
  // honoured that; the submenu used to disagree by preferring the active runtime.
  it('keeps a local-owned file openable while a remote runtime is active', async () => {
    mockSettings.activeRuntimeEnvironmentId = 'runtime-1'

    const tree = expandNode(await renderMenu({ fileRuntimeEnvironmentId: null }))

    expect(findItem(tree, 'VS Code')?.props.disabled).toBe(false)
    expect(findItem(tree, 'Finder')?.props.disabled).toBe(false)

    const reveal = findItem(tree, 'Reveal in Finder')
    expect(reveal).toBeTruthy()
    ;(reveal?.props.onSelect as (() => void) | undefined)?.()
    expect(openPathMock).toHaveBeenCalledWith('/repo/foo.ts')

    // Why: openWorktreePath re-checks the guard on click, so an enabled row that
    // still toasted would be the same disagreement one layer down.
    ;(findItem(tree, 'VS Code')?.props.onSelect as (() => void) | undefined)?.()
    await Promise.resolve()
    expect(openInExternalEditorMock).toHaveBeenCalledWith({
      path: '/repo/foo.ts',
      command: 'code',
      connectionId: null
    })
  })

  it('blocks both entry points for a file owned by another runtime', async () => {
    const tree = expandNode(await renderMenu({ fileRuntimeEnvironmentId: 'runtime-1' }))

    expect(findItem(tree, 'VS CodeLocal only')?.props.disabled).toBe(true)
    expect(findItem(tree, 'FinderLocal only')?.props.disabled).toBe(true)

    const reveal = findItem(tree, 'Reveal in Finder')
    expect(reveal).toBeTruthy()
    ;(reveal?.props.onSelect as (() => void) | undefined)?.()
    expect(openPathMock).not.toHaveBeenCalled()
  })
})

describe('EditorFileTabContextMenu open-in tab eligibility', () => {
  beforeEach(() => {
    vi.resetModules()
    shortcutLabelMock.mockReturnValue(null)
    mockSettings.activeRuntimeEnvironmentId = null
    mockSettings.openInApplications = [{ id: 'vscode', label: 'VS Code', command: 'code' }]
    vi.stubGlobal('navigator', { userAgent: 'Mac' })
    vi.stubGlobal('window', {
      api: {
        shell: { openInExternalEditor: openInExternalEditorMock, openPath: openPathMock },
        ui: { writeClipboardText: vi.fn() }
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function hasOpenInSubmenu(tree: unknown): boolean {
    return findElementsByType(tree, 'DropdownMenuSubTrigger').some(
      (trigger) => extractText(trigger.props.children) === 'Open in'
    )
  }

  it.each([
    ['edit' as const, undefined],
    ['markdown-preview' as const, undefined],
    ['diff' as const, 'unstaged' as const]
  ])('offers the submenu for a %s tab backed by a real file', async (mode, diffSource) => {
    expect(hasOpenInSubmenu(expandNode(await renderMenu({ mode, diffSource })))).toBe(true)
  })

  // Why: these tabs park the worktree root or a synthetic id in filePath, so the
  // launcher would open the whole worktree (or fail) instead of the tab's subject.
  it.each([
    ['conflict-review' as const, undefined],
    ['check-details' as const, undefined],
    ['diff' as const, 'combined-all' as const],
    ['diff' as const, 'combined-uncommitted' as const],
    ['diff' as const, 'combined-branch' as const],
    ['diff' as const, 'combined-commit' as const]
  ])('hides the submenu for a %s tab with no real file path', async (mode, diffSource) => {
    expect(hasOpenInSubmenu(expandNode(await renderMenu({ mode, diffSource })))).toBe(false)
  })
})

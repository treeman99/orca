// @vitest-environment happy-dom

// The `?` menu's guide entry. Kept out of SidebarSettingsHelpMenu.test.tsx because that file
// asserts on static markup, and the guide only exists after a click.

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openModal: vi.fn(),
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn(),
  useShortcutKeyDetails: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      openModal: mocks.openModal,
      openSettingsPage: mocks.openSettingsPage,
      openSettingsTarget: mocks.openSettingsTarget,
      updateStatus: { state: 'idle' }
    })
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutKeyDetails: mocks.useShortcutKeyDetails
}))

vi.mock('@/hooks/useMountedRef', () => ({ useMountedRef: () => ({ current: true }) }))

vi.mock('../onboarding/show-onboarding-event', () => ({
  showOnboardingFromRenderer: vi.fn()
}))

vi.mock('../setup-guide/use-setup-guide-progress', () => ({
  useSetupGuideProgress: () => ({ ready: true, coreDoneCount: 5, coreTotal: 5, stepDone: {} })
}))

vi.mock('../setup-guide/SetupGuideProgressRing', () => ({
  SetupGuideProgressRing: () => <span />
}))

// The dropdown root keeps its own element here so the test can assert the guide dialog is
// NOT inside it — a dialog rendered within the menu unmounts with the menu on select.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div data-testid="dropdown-root">{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect
  }: {
    children: ReactNode
    onSelect?: (event: Event) => void
  }) => (
    <button data-testid="menu-item" onClick={() => onSelect?.(new Event('menu.itemSelect'))}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr data-testid="menu-separator" />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }))

vi.mock('./usage-guide/UsageGuideDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="usage-guide-dialog" /> : null)
}))

import { SidebarSettingsHelpMenu } from './SidebarSettingsHelpMenu'

const roots: Root[] = []
const GUIDE_LABEL = '사용 가이드'

async function renderMenu(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<SidebarSettingsHelpMenu />)
  })
  return container
}

function menuItems(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid="menu-item"]'))
}

function findGuideItem(container: HTMLElement): HTMLButtonElement {
  const item = menuItems(container).find((element) => element.textContent?.includes(GUIDE_LABEL))
  expect(item).toBeDefined()
  return item as HTMLButtonElement
}

describe('the ? menu usage guide entry', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    Object.assign(window, { api: { shell: { openUrl: vi.fn() }, app: { restart: vi.fn() } } })
    mocks.useShortcutKeyDetails.mockReturnValue({ keys: ['⌘', ','], doubleTap: false })
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
  })

  it('offers the guide as the first entry in the menu', async () => {
    const container = await renderMenu()
    expect(menuItems(container)[0]?.textContent).toContain(GUIDE_LABEL)
  })

  it('does not open the menu with a separator', async () => {
    const container = await renderMenu()
    const nodes = Array.from(container.querySelectorAll('[data-testid]'))
    expect(nodes[0]?.getAttribute('data-testid')).not.toBe('menu-separator')
  })

  it('mounts nothing until the entry is chosen', async () => {
    const container = await renderMenu()
    expect(container.querySelector('[data-testid="usage-guide-dialog"]')).toBeNull()
  })

  it('opens the guide when the entry is chosen', async () => {
    const container = await renderMenu()
    const item = findGuideItem(container)

    await act(async () => {
      item.click()
    })

    expect(container.querySelector('[data-testid="usage-guide-dialog"]')).not.toBeNull()
  })

  it('renders the guide outside the dropdown so selecting the entry cannot close it', async () => {
    const container = await renderMenu()

    await act(async () => {
      findGuideItem(container).click()
    })

    const dialog = container.querySelector('[data-testid="usage-guide-dialog"]')
    const dropdownRoot = container.querySelector('[data-testid="dropdown-root"]')
    expect(dialog).not.toBeNull()
    expect(dropdownRoot).not.toBeNull()
    expect(dropdownRoot?.contains(dialog as Node)).toBe(false)
  })
})

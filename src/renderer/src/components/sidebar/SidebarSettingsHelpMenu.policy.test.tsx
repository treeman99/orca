// @vitest-environment happy-dom

// Behavioural gate test for the `?` menu under `disableVendorLinks` — the surface the
// fleet test actually reported: x.com and Discord rows sitting in a locked-down build.
//
// Kept out of SidebarSettingsHelpMenu.test.tsx because that file pins the UNGATED menu
// and deliberately runs against the real policy module.

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'

const mocks = vi.hoisted(() => ({
  openModal: vi.fn(),
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn(),
  useShortcutKeyDetails: vi.fn()
}))

const UNRESTRICTED = {
  allowedAgents: null,
  lockdown: false,
  disableAutoUpdate: false,
  disableCloudRelay: false,
  disableMobilePairing: false,
  disableMobileEmulator: false,
  disableExternalAutomations: false,
  disableUnattendedAgentRuns: false,
  disableAgentInstallSuggestions: false,
  disableUsagePolling: false,
  disableVendorProviderAccounts: false,
  disableRemoteOrcaServer: false,
  disableVoice: false,
  disablePlugins: false,
  disableVendorLinks: false,
  requireComputerUseApproval: false
} satisfies EnterprisePolicyView

const policyState = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  getEnterprisePolicyView: () => policyState.current,
  getPolicyAllowedAgents: () => null,
  useEnterprisePolicyView: () => policyState.current
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

// Flattened so every item that would render inside the portal is in the container.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => (
    <button data-testid="menu-item">{children}</button>
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

import { SidebarSettingsHelpMenu } from './SidebarSettingsHelpMenu'

const roots: Root[] = []

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

function itemLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-testid="menu-item"]')).map(
    (item) => item.textContent ?? ''
  )
}

const VENDOR_ROWS = ['Docs', 'Changelog', 'GitHub', 'Discord', 'X']

describe('the Help menu under disableVendorLinks', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    Object.assign(window, { api: { shell: { openUrl: vi.fn() }, updater: { check: vi.fn() } } })
    mocks.useShortcutKeyDetails.mockReturnValue({ keys: ['⌘', ','], doubleTap: false })
    policyState.current = UNRESTRICTED
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.innerHTML = ''
  })

  it('offers the vendor rows when no policy is in effect', async () => {
    const container = await renderMenu()
    const labels = itemLabels(container)
    for (const row of VENDOR_ROWS) {
      expect(
        labels.some((label) => label.includes(row)),
        row
      ).toBe(true)
    }
  })

  it('renders no vendor row under the policy, and keeps the local ones', async () => {
    policyState.current = { ...UNRESTRICTED, disableVendorLinks: true }
    const container = await renderMenu()
    const labels = itemLabels(container)
    for (const row of VENDOR_ROWS) {
      expect(
        labels.some((label) => label.includes(row)),
        row
      ).toBe(false)
    }
    // The point of the switch is the links, not the menu — local actions stay.
    expect(labels.some((label) => label.includes('Keyboard Shortcuts'))).toBe(true)
  })

  it('leaves no orphaned separator where the vendor block was', async () => {
    policyState.current = { ...UNRESTRICTED, disableVendorLinks: true }
    const container = await renderMenu()
    const children = Array.from(container.querySelectorAll('[data-testid]'))
    const separatorRuns = children.filter(
      (node, index) =>
        node.getAttribute('data-testid') === 'menu-separator' &&
        children[index + 1]?.getAttribute('data-testid') === 'menu-separator'
    )
    expect(separatorRuns).toEqual([])
    expect(children.at(-1)?.getAttribute('data-testid')).not.toBe('menu-separator')
  })

  it('names no vendor URL anywhere in the rendered markup', async () => {
    policyState.current = { ...UNRESTRICTED, disableVendorLinks: true }
    const container = await renderMenu()
    for (const host of ['x.com', 'discord.gg', 'github.com', 'onorca.dev']) {
      expect(container.innerHTML.includes(host), host).toBe(false)
    }
  })
})

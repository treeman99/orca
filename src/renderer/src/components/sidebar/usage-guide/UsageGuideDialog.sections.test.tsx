// @vitest-environment happy-dom

// Sections 2–5. Kept out of UsageGuideDialog.test.tsx because that file pins the dialog shell
// (rail wiring, scroll, section 1); this one pins the table of contents and section 5's
// before/after frames, which are the part a later edit is most likely to hollow out.

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, options?: Record<string, string>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => options?.[name] ?? `{{${name}}}`)
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutLabel: (actionId: string) => `<${actionId}>`
}))

import { UsageGuideDialog } from './UsageGuideDialog'

const roots: Root[] = []
const EXPECTED_SECTION_IDS = ['getting-started', 'agents', 'terminals', 'review', 'settings']

async function renderDialog(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<UsageGuideDialog open onOpenChange={() => {}} />)
  })
  return container
}

function railItem(container: HTMLElement, id: string): HTMLButtonElement {
  const item = container.querySelector<HTMLButtonElement>(`[data-usage-guide-rail-item="${id}"]`)
  expect(item, id).not.toBeNull()
  return item as HTMLButtonElement
}

function sectionBody(container: HTMLElement, id: string): HTMLElement {
  const body = container.querySelector<HTMLElement>(`[data-usage-guide-section="${id}"]`)
  expect(body, id).not.toBeNull()
  return body as HTMLElement
}

describe('the usage guide table of contents', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
  })

  it('renders all five sections in the rail and in the body, in order', async () => {
    const container = await renderDialog()
    const railIds = Array.from(
      container.querySelectorAll<HTMLElement>('[data-usage-guide-rail-item]')
    ).map((item) => item.getAttribute('data-usage-guide-rail-item'))
    const bodyIds = Array.from(
      container.querySelectorAll<HTMLElement>('[data-usage-guide-section]')
    ).map((section) => section.getAttribute('data-usage-guide-section'))

    expect(railIds).toEqual(EXPECTED_SECTION_IDS)
    expect(bodyIds).toEqual(EXPECTED_SECTION_IDS)
  })

  it('numbers the body headings to match the rail order', async () => {
    const container = await renderDialog()
    expect(sectionBody(container, 'settings').textContent).toContain('5.')
  })

  it('scrolls to section 5 when its rail entry is clicked', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
      writable: true
    })
    const container = await renderDialog()

    await act(async () => {
      railItem(container, 'settings').click()
    })

    expect(scrollIntoView).toHaveBeenCalled()
    const scrolled = scrollIntoView.mock.instances.at(-1) as HTMLElement
    expect(scrolled.getAttribute('data-usage-guide-section')).toBe('settings')
    expect(railItem(container, 'settings').getAttribute('aria-current')).toBe('true')
    expect(railItem(container, 'getting-started').getAttribute('aria-current')).toBeNull()
  })
})

describe('section 5', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
  })

  it('shows every setting as a two-pane before/after, never as prose alone', async () => {
    const container = await renderDialog()
    const settings = sectionBody(container, 'settings')
    const left = settings.querySelectorAll('[data-comparison-pane="left"]')
    const right = settings.querySelectorAll('[data-comparison-pane="right"]')

    expect(left.length).toBeGreaterThanOrEqual(4)
    expect(left.length).toBe(right.length)
  })

  it('labels both panes of every comparison', async () => {
    const container = await renderDialog()
    const settings = sectionBody(container, 'settings')
    for (const pane of settings.querySelectorAll<HTMLElement>('[data-comparison-pane]')) {
      expect(pane.textContent?.trim().length ?? 0).toBeGreaterThan(0)
    }
  })

  it('names the settings by the same labels their real controls use', async () => {
    const container = await renderDialog()
    const settings = sectionBody(container, 'settings')
    for (const label of [
      'Workspace Card Layout',
      'Show Tasks Button',
      'Default Diff View',
      'View as tree',
      'Cursor Shape'
    ]) {
      expect(settings.textContent, label).toContain(label)
    }
  })
})

describe('sections 2 to 4', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
  })

  it('names only the agents this build allows', async () => {
    const container = await renderDialog()
    const agents = sectionBody(container, 'agents')
    expect(agents.textContent).toContain('Claude')
    expect(agents.textContent).toContain('OpenCode')
  })

  it('renders the platform-resolved shortcut, never a hardcoded one', async () => {
    const container = await renderDialog()
    const terminals = sectionBody(container, 'terminals')
    expect(terminals.textContent).toContain('<tab.newTerminal>')
    expect(terminals.textContent).toContain('<terminal.splitRight>')
  })

  it('names both the PR and MR wording so the guide is not GitHub-only', async () => {
    const container = await renderDialog()
    const review = sectionBody(container, 'review')
    expect(review.textContent).toContain('Create PR')
    expect(review.textContent).toContain('Create MR')
  })
})

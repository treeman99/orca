// @vitest-environment happy-dom

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

// Why: fall back to the inline defaults so the assertions do not depend on a loaded catalog.
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, options?: Record<string, string>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => options?.[name] ?? `{{${name}}}`)
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutLabel: () => '⌘N'
}))

import { UsageGuideDialog } from './UsageGuideDialog'

const roots: Root[] = []

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

function railItems(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[data-usage-guide-rail-item]'))
}

describe('UsageGuideDialog', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
  })

  it('gives every section a rail button and a matching section body', async () => {
    const container = await renderDialog()
    const items = railItems(container)
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      const id = item.getAttribute('data-usage-guide-rail-item')
      expect(container.querySelector(`[data-usage-guide-section="${id}"]`)).not.toBeNull()
    }
  })

  it('renders rail entries as real buttons so Tab reaches them', async () => {
    const container = await renderDialog()
    for (const item of railItems(container)) {
      expect(item.tagName).toBe('BUTTON')
      expect(item.getAttribute('type')).toBe('button')
    }
  })

  it('marks the first section current before anything is clicked', async () => {
    const container = await renderDialog()
    const [first] = railItems(container)
    expect(first?.getAttribute('aria-current')).toBe('true')
  })

  it('scrolls the clicked section into view and marks it current', async () => {
    const scrollIntoView = vi.fn()
    // happy-dom leaves this undefined; the component calls it optionally.
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
      writable: true
    })
    const container = await renderDialog()
    const target = railItems(container).at(-1)
    expect(target).toBeDefined()

    await act(async () => {
      target?.click()
    })

    expect(scrollIntoView).toHaveBeenCalled()
    const scrolled = scrollIntoView.mock.instances.at(-1) as HTMLElement
    expect(scrolled.getAttribute('data-usage-guide-section')).toBe(
      target?.getAttribute('data-usage-guide-rail-item')
    )
    expect(target?.getAttribute('aria-current')).toBe('true')
  })

  it('renders section 1 with the two-pane comparison figure the later sections reuse', async () => {
    const container = await renderDialog()
    expect(container.querySelector('[data-comparison-pane="left"]')).not.toBeNull()
    expect(container.querySelector('[data-comparison-pane="right"]')).not.toBeNull()
    expect(container.textContent).toContain('Git 저장소 프로젝트')
    expect(container.textContent).toContain('폴더 프로젝트 (Git 아님)')
  })

  it('names the Git and folder creation surfaces by their real labels', async () => {
    const container = await renderDialog()
    // Quoted through the same catalog keys the real controls use, so a renamed
    // button renames the guide too instead of silently drifting.
    expect(container.textContent).toContain('Create worktree')
    expect(container.textContent).toContain('Create Folder Workspace')
  })
})

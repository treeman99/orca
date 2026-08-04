// @vitest-environment happy-dom

// "Other ways to reach us" is three vendor destinations and nothing else, so the
// card goes with them rather than becoming a titled empty box. Composing and
// sending feedback is a separate lane (`disableTelemetry`) and must survive here.

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'

const policyState = vi.hoisted(() => ({ disableVendorLinks: false }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  useEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView
}))

vi.mock('@/hooks/useMountedRef', () => ({ useMountedRef: () => ({ current: true }) }))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

// Flattened so the dialog body lands in the container instead of a portal.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>
}))

vi.mock('./SidebarFeedbackImageAttachments', () => ({
  SidebarFeedbackImageAttachments: () => null
}))

vi.mock('./use-feedback-image-drop', () => ({
  useFeedbackImageDrop: () => ({
    isDragActive: false,
    contentRef: { current: null },
    dragHandlers: {}
  })
}))

import { SidebarFeedbackDialog } from './SidebarFeedbackDialog'

const roots: Root[] = []

async function renderDialog(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<SidebarFeedbackDialog open onOpenChange={() => {}} />)
  })
  return container
}

describe('SidebarFeedbackDialog under disableVendorLinks', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    policyState.disableVendorLinks = false
    Object.assign(window, {
      api: { gh: { viewer: vi.fn().mockResolvedValue(null) }, shell: { openUrl: vi.fn() } }
    })
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.innerHTML = ''
  })

  it('offers the vendor channels when no policy is in effect', async () => {
    const container = await renderDialog()
    expect(container.textContent).toContain('Other ways to reach us')
    for (const label of ['GitHub issues', 'Join Discord', 'Follow on X']) {
      expect(container.textContent, label).toContain(label)
    }
  })

  it('drops the whole card under the policy but keeps the feedback form', async () => {
    policyState.disableVendorLinks = true
    const container = await renderDialog()
    expect(container.textContent).not.toContain('Other ways to reach us')
    for (const label of ['GitHub issues', 'Join Discord', 'Follow on X']) {
      expect(container.textContent, label).not.toContain(label)
    }
    expect(container.querySelector('textarea')).not.toBeNull()
    expect(container.textContent).toContain('Send')
  })
})

// @vitest-environment happy-dom

// The worst of the vendor links: it puts token counts and estimated cost into a
// public post. `disableUsagePolling` already removes the pane it lives in, so this
// covers the partial policy where a fleet keeps local stats but blocks vendor links.

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'
import type { ClaudeUsageSummary } from '../../../../shared/claude-usage-types'

const policyState = vi.hoisted(() => ({ disableVendorLinks: false }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  useEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView
}))

// Flattened so the dialog body renders without being opened.
vi.mock('../ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('./ShareUsageCard', () => ({ ShareUsageCard: () => <div /> }))

vi.mock('html-to-image', () => ({ toPng: vi.fn() }))

import { ShareUsageButton } from './ShareUsageButton'

// The card itself is mocked above; these only have to satisfy the prop type.
const summary: ClaudeUsageSummary = {
  scope: 'orca',
  range: '30d',
  sessions: 12,
  turns: 340,
  zeroCacheReadTurns: 4,
  inputTokens: 900_000,
  outputTokens: 334_567,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cacheReuseRate: null,
  estimatedCostUsd: 12.5,
  topModel: 'claude-opus-5',
  topProject: null,
  hasAnyClaudeData: true
}

const roots: Root[] = []

async function render(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<ShareUsageButton provider="claude" summary={summary} daily={[]} range="30d" />)
  })
  return container
}

describe('ShareUsageButton under disableVendorLinks', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    policyState.disableVendorLinks = false
    Object.assign(window, { api: { shell: { openUrl: vi.fn() } } })
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.innerHTML = ''
  })

  it('offers the X hand-off when no policy is in effect', async () => {
    expect((await render()).textContent).toContain('Share on X')
  })

  it('drops the X hand-off under the policy, keeping the local copy action', async () => {
    policyState.disableVendorLinks = true
    const container = await render()
    expect(container.textContent).not.toContain('Share on X')
    expect(container.textContent).toContain('Copy image')
  })
})

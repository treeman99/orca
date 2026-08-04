// @vitest-environment happy-dom

// The two Settings surfaces the chokepoint alone could not clean up: `openUrl` refuses
// them under policy, so the rows survived as controls that look live and do nothing.
// "Support Orca" also starts collapsed rather than collapsing after the gh probe —
// `checkOrcaStarred` resolves to `true` under `disableStarNag`, which renders the
// "Starred" confirmation instead of hiding the section.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'

const policyState = vi.hoisted(() => ({ disableVendorLinks: false }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  useEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView,
  getEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView
}))

vi.mock('@/hooks/useMountedRef', () => ({ useMountedRef: () => ({ current: true }) }))

vi.mock('../../lib/telemetry', () => ({
  PRIVACY_URL: 'https://www.onorca.dev/docs/telemetry',
  getConsentState: () => Promise.resolve({ optIn: true }),
  setOptIn: vi.fn()
}))

vi.mock('../../store', () => ({ useAppStore: () => vi.fn() }))

vi.mock('./PrivacyDiagnosticsSection', () => ({ PrivacyDiagnosticsSection: () => null }))

vi.mock('./SearchableSetting', () => ({
  SearchableSetting: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

import { GeneralSupportSection } from './GeneralSupportSection'
import { PrivacyPane } from './PrivacyPane'

const roots: Root[] = []
const checkOrcaStarred = vi.fn(() => Promise.resolve<boolean | null>(false))
const SETTINGS = { telemetry: { optedIn: true } } as Parameters<typeof PrivacyPane>[0]['settings']

async function render(node: React.ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(node)
  })
  return container
}

beforeEach(() => {
  policyState.disableVendorLinks = false
  checkOrcaStarred.mockClear()
  ;(globalThis as unknown as { window: Record<string, unknown> }).window.api = {
    gh: { checkOrcaStarred, starOrca: vi.fn() },
    shell: { openUrl: vi.fn() },
    starNag: { complete: vi.fn() }
  }
})

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) {
      root.unmount()
    }
  })
  document.body.innerHTML = ''
})

describe('PrivacyPane privacy-policy link', () => {
  it('renders the vendor link when no policy restricts it', async () => {
    const container = await render(<PrivacyPane settings={SETTINGS} />)
    expect(container.textContent).toContain('Privacy policy')
  })

  it('drops the link under disableVendorLinks but keeps the consent control', async () => {
    policyState.disableVendorLinks = true
    const container = await render(<PrivacyPane settings={SETTINGS} />)
    expect(container.textContent).not.toContain('Privacy policy')
    expect(container.querySelector('[role="switch"]')).not.toBeNull()
  })
})

describe('GeneralSupportSection', () => {
  it('probes gh and renders the section when no policy restricts it', async () => {
    const container = await render(<GeneralSupportSection hasPrecedingSections={false} />)
    expect(checkOrcaStarred).toHaveBeenCalled()
    expect(container.textContent).toContain('Support Orca')
  })

  it('stays collapsed and never probes gh under disableVendorLinks', async () => {
    policyState.disableVendorLinks = true
    const container = await render(<GeneralSupportSection hasPrecedingSections={false} />)
    expect(checkOrcaStarred).not.toHaveBeenCalled()
    expect(container.querySelector('section')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).not.toContain('Star Orca on GitHub')
  })
})

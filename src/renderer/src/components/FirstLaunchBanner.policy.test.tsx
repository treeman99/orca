// The notice itself belongs to `disableTelemetry`; only its "Privacy policy" link
// is a vendor destination, so the policy takes the link and leaves the notice.

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../shared/enterprise-policy-view'

const policyState = vi.hoisted(() => ({ disableVendorLinks: false }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  useEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView
}))

vi.mock('../lib/telemetry', () => ({
  PRIVACY_URL: 'https://www.onorca.dev/docs/telemetry',
  acknowledgeBanner: vi.fn(),
  setOptIn: vi.fn()
}))

vi.mock('@/hooks/useMountedRef', () => ({ useMountedRef: () => ({ current: true }) }))

import { FirstLaunchBanner } from './FirstLaunchBanner'

function render(): string {
  return renderToStaticMarkup(
    <FirstLaunchBanner onResolve={() => {}} fetchSettings={async () => {}} />
  )
}

describe('FirstLaunchBanner under disableVendorLinks', () => {
  beforeEach(() => {
    policyState.disableVendorLinks = false
  })

  it('links the privacy doc when no policy is in effect', () => {
    expect(render()).toContain('Privacy policy')
  })

  it('drops the link under the policy but keeps the notice and its actions', () => {
    policyState.disableVendorLinks = true
    const markup = render()
    expect(markup).not.toContain('Privacy policy')
    expect(markup).toContain('Help us decide what to build next')
    expect(markup).toContain('Opt out')
  })
})

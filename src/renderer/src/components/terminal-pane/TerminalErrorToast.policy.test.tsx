// The toast ships a plain <a href> rather than an openUrl call, so it is the one
// vendor link that would survive a renderer gate written only against the IPC.

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'

const policyState = vi.hoisted(() => ({ disableVendorLinks: false }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  useEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView
}))

import { TerminalErrorToast } from './TerminalErrorToast'

function render(): string {
  return renderToStaticMarkup(
    <TerminalErrorToast error="node-pty: spawn failed" onDismiss={() => {}} />
  )
}

describe('TerminalErrorToast under disableVendorLinks', () => {
  beforeEach(() => {
    policyState.disableVendorLinks = false
  })

  it('offers the vendor tracker when no policy is in effect', () => {
    const markup = render()
    expect(markup).toContain('https://github.com/stablyai/orca/issues')
    expect(markup).toContain('file an issue')
  })

  it('drops the link and the instruction under the policy, keeping the error', () => {
    policyState.disableVendorLinks = true
    const markup = render()
    expect(markup).not.toContain('github.com')
    expect(markup).not.toContain('file an issue')
    // The failure itself is what the user needs; only the wrong advice goes.
    expect(markup).toContain('node-pty: spawn failed')
  })
})

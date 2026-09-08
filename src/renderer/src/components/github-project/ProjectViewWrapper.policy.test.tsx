// @vitest-environment happy-dom

// The unsupported-layout tab names the vendor's public tracker three times — button,
// tooltip and aria-label — so a gate on the button alone would still read the URL out
// to a screen reader.
//
// happy-dom is needed only because this module transitively imports monaco, which
// touches `window` at import time; the assertions themselves are static markup.

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'
import type { GitHubProjectViewSummary } from '../../../../shared/github/project-types'

const policyState = vi.hoisted(() => ({ disableVendorLinks: false }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  useEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView
}))

// Upstream moved this out of ProjectViewWrapper and renamed it; the gate is unchanged.
import { ProjectViewTabStrip as ViewTabStrip } from './ProjectViewStates'

// Board, not Roadmap: v1.4.198 made ROADMAP_LAYOUT a supported layout, and a supported
// tab renders no tracker link at all, so it cannot prove the gate either way.
const views = [
  { id: 'v1', name: 'Board', number: 1, layout: 'BOARD_LAYOUT' }
] as unknown as GitHubProjectViewSummary[]

function render(): string {
  return renderToStaticMarkup(<ViewTabStrip views={views} activeViewId="v1" onPick={() => {}} />)
}

// The hover card's body — and with it the "File feature request" button — is not in
// the closed tab's markup, so these assertions cover the two surfaces that always
// ship: the `title` tooltip and the `aria-label`. Both read the URL out verbatim.
describe('unsupported project-view tab under disableVendorLinks', () => {
  beforeEach(() => {
    policyState.disableVendorLinks = false
  })

  it('points at the tracker when no policy is in effect', () => {
    const markup = render()
    expect(markup).toContain('github.com/stablyai/orca/issues/new')
    expect(markup).toContain('File a feature request at')
  })

  it('names the tracker nowhere under the policy, and still says why the tab is off', () => {
    policyState.disableVendorLinks = true
    const markup = render()
    expect(markup).not.toContain('github.com')
    expect(markup).not.toContain('File a feature request at')
    // Apostrophes arrive HTML-escaped, so match a stretch of copy without one.
    expect(markup).toContain('support Board project views yet')
  })
})

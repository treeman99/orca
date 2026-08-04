// Hiding the Appearance row is not the same as removing it from the search index.
//
// getSidebarEntries() feeds two consumers: the in-pane filter (AppearancePane,
// AppearanceWindowSidebarSection) and, via getAppearancePaneSearchEntries, the Cmd+J
// catalog — which folds pane-level entry titles into the section's keywords. Leaving the
// mobile entry in place meant "mobile"/"phone" still matched Appearance and scrolled the
// user to a section with nothing in it.

import { describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'

const policyState = vi.hoisted(() => ({ disableMobilePairing: false }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  getEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView,
  useEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView
}))

const { getShowMobileButtonEntry, getSidebarEntries } = await import('./appearance-sidebar-search')
const { getAppearancePaneSearchEntries } = await import('./appearance-search')
const { matchesSettingsSearch } = await import('./settings-search')

function withPolicy<T>(disableMobilePairing: boolean, run: () => T): T {
  policyState.disableMobilePairing = disableMobilePairing
  try {
    return run()
  } finally {
    policyState.disableMobilePairing = false
  }
}

describe('appearance sidebar search entries under the corporate policy', () => {
  it('indexes the Orca Mobile toggle when no policy is in force', () => {
    const titles = withPolicy(false, () => getSidebarEntries().map((entry) => entry.title))
    expect(titles).toContain(getShowMobileButtonEntry().title)
  })

  it('drops the Orca Mobile toggle from the sidebar index under the policy', () => {
    const titles = withPolicy(true, () => getSidebarEntries().map((entry) => entry.title))
    expect(titles).not.toContain(getShowMobileButtonEntry().title)
  })

  it('stops matching "mobile" and "phone" in the Appearance pane index under the policy', () => {
    const entries = withPolicy(true, () => getAppearancePaneSearchEntries())
    expect(matchesSettingsSearch('mobile', entries)).toBe(false)
    expect(matchesSettingsSearch('phone', entries)).toBe(false)
  })

  it('still matches "mobile" when no policy is in force', () => {
    const entries = withPolicy(false, () => getAppearancePaneSearchEntries())
    expect(matchesSettingsSearch('mobile', entries)).toBe(true)
  })

  it('leaves the neighbouring sidebar toggles indexed under the policy', () => {
    const entries = withPolicy(true, () => getSidebarEntries())
    expect(matchesSettingsSearch('automations', entries)).toBe(true)
    expect(matchesSettingsSearch('tasks', entries)).toBe(true)
  })
})

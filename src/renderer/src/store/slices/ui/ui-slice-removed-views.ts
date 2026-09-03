import type { TopLevelView } from '../../../../../shared/ui-chrome-types'
import { ARTIFACT_SHARING_REMOVED } from '../../../../../shared/artifact-sharing-removal'
import { getEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'

// The corporate policy removed the Mobile view, so nothing may leave `activeView`
// sitting there. Not folded into openMobilePage: `activeView` has two other writers
// (startup hydration and the generic setActiveView), and neither passes the action.
export function isMobileViewBlockedByPolicy(): boolean {
  return getEnterprisePolicyView().disableMobilePairing
}

/** Both removed top-level views, for the writers that take a view id rather than an action. */
export function isTopLevelViewRemoved(view: TopLevelView): boolean {
  if (view === 'mobile') {
    return isMobileViewBlockedByPolicy()
  }
  return view === 'artifacts' && ARTIFACT_SHARING_REMOVED
}

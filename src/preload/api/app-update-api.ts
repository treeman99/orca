import type { AppUpdateCheckStatus, AppUpdateLookupTarget } from '../../shared/app-update-check'
import type {
  CorporateSkillBundleStatus,
  CorporateSkillBundleUpdateResult
} from '../../shared/corporate-skill-bundle'

/**
 * The corporate skill bundle lane. Unlike the app lane it does write: `update` replaces the
 * bundle's skills in the user's agent homes. What it downloads and where it writes are
 * main's decision — no argument here names a URL or a path.
 */
export type CorporateSkillBundleApi = {
  getStatus: () => Promise<CorporateSkillBundleStatus>
  check: () => Promise<CorporateSkillBundleStatus>
  update: () => Promise<CorporateSkillBundleUpdateResult>
  dismiss: (args: { commitSha: string }) => Promise<CorporateSkillBundleStatus>
  onStatus: (callback: (status: CorporateSkillBundleStatus) => void) => () => void
}

// No download/install verbs for the app itself: this build has no in-app updater. The only
// action the renderer may take is opening the corporate release page, and the URL for it is
// main's, never the caller's.
export type AppUpdateApi = {
  getStatus: () => Promise<AppUpdateCheckStatus>
  check: () => Promise<AppUpdateCheckStatus>
  dismissVersion: (args: { version: string }) => Promise<AppUpdateCheckStatus>
  openReleasePage: () => Promise<void>
  onStatus: (callback: (status: AppUpdateCheckStatus) => void) => () => void
  /** Where a check would look, without performing one. No network, no policy gate. */
  getLookupTarget: () => Promise<AppUpdateLookupTarget>
  /** The user picked "Check for Updates..." in the menu bar. */
  onCheckRequested: (callback: () => void) => () => void
  skillBundle: CorporateSkillBundleApi
}

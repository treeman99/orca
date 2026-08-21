import type { AppUpdateCheckStatus } from '../../shared/app-update-check'

// No download/install verbs: this build has no in-app updater. The only action the
// renderer may take is opening the corporate release page, and the URL for it is
// main's, never the caller's.
export type AppUpdateApi = {
  getStatus: () => Promise<AppUpdateCheckStatus>
  check: () => Promise<AppUpdateCheckStatus>
  dismissVersion: (args: { version: string }) => Promise<AppUpdateCheckStatus>
  openReleasePage: () => Promise<void>
  onStatus: (callback: (status: AppUpdateCheckStatus) => void) => () => void
}

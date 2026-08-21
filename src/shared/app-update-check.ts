// The update-check lane's wire shape, shared by main, preload, and the renderer.
//
// Fork: this build has no in-app updater. The lane reads a release tag off the
// corporate GitHub Enterprise host and says "a newer one exists" — it never
// downloads, installs, or replaces anything, so there is no download/install
// state to model here.

/** Why no update information is available. Never surfaced as an error to the user. */
export type AppUpdateUnavailableReason =
  /** No corporate GitHub Enterprise host is configured, or it resolved to vendor SaaS. */
  | 'no-enterprise-host'
  /** `gh` is missing, unauthenticated, or the host did not answer. */
  | 'lookup-failed'
  /** The repository answered, but nothing in it parsed as a released version. */
  | 'no-release'

export type AppUpdateCheckStatus =
  /** The administrator's `disableAutoUpdate` is on. */
  | { state: 'disabled' }
  /** Nothing has been checked yet in this session. */
  | { state: 'unknown' }
  | { state: 'unavailable'; reason: AppUpdateUnavailableReason }
  | { state: 'up-to-date'; currentVersion: string; latestVersion: string }
  | {
      state: 'available'
      currentVersion: string
      latestVersion: string
      /** The tag exactly as the host published it, e.g. "v1.4.186". */
      releaseTag: string
      /** Release page on the corporate host. Never a vendor host. */
      releaseUrl: string
      /** True when the user already chose "don't tell me about this one again". */
      dismissed: boolean
    }

/** The channel main pushes a fresh status on. */
export const APP_UPDATE_STATUS_EVENT = 'appUpdate:status'

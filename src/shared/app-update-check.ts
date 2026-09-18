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

/**
 * Which coordinate the check reads. Resolved from policy and `gh`'s own host —
 * never from the workspace's remote — and never a vendor host.
 *
 * Carried on every checked status and readable on its own, because "is the update
 * check working here?" is answered by the target as much as by the outcome: an
 * empty `host` is a misconfigured fleet, not a network failure.
 */
export type AppUpdateLookupTarget = {
  /** Corporate GitHub Enterprise host, or null when none resolved. */
  host: string | null
  /** `OWNER/REPO` on that host. */
  repository: string
}

/** Fields every status that came from an actual check carries. */
type CheckedStatusFields = {
  target: AppUpdateLookupTarget
  /** When the check that produced this status finished (epoch ms). */
  checkedAt: number
}

export type AppUpdateCheckStatus =
  /** The administrator's `disableAutoUpdate` is on. */
  | { state: 'disabled' }
  /** Nothing has been checked yet in this session. */
  | { state: 'unknown' }
  | ({ state: 'unavailable'; reason: AppUpdateUnavailableReason } & CheckedStatusFields)
  | ({ state: 'up-to-date'; currentVersion: string; latestVersion: string } & CheckedStatusFields)
  | ({
      state: 'available'
      currentVersion: string
      latestVersion: string
      /** The tag exactly as the host published it, e.g. "v1.4.186". */
      releaseTag: string
      /** Release page on the corporate host. Never a vendor host. */
      releaseUrl: string
      /** True when the user already chose "don't tell me about this one again". */
      dismissed: boolean
    } & CheckedStatusFields)

/** The channel main pushes a fresh status on. */
export const APP_UPDATE_STATUS_EVENT = 'appUpdate:status'

/**
 * Main tells the renderer the user picked "Check for Updates..." in the menu bar.
 *
 * The menu lives in main but the result is rendered in one place only, so main
 * forwards the intent instead of running the check itself — the menu item and the
 * settings button then cannot disagree about how an outcome is presented.
 */
export const APP_UPDATE_CHECK_REQUESTED_EVENT = 'ui:checkForUpdates'

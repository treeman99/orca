// The single lane into the enterprise update check, and therefore where
// `disableAutoUpdate` is enforced.
//
// The gate sits on `check()` rather than on the scheduler, because three callers
// reach the same lookup: the startup timer, the periodic re-check, and the
// renderer's own `appUpdate:check`. Gating `start()` would leave the IPC path live —
// which is the exact mistake the star-nag gate made before it moved to the client.
//
// Nothing here downloads or installs. The lane's whole output is a status object and
// a release-page URL; `electron-updater` is not a dependency of this build.

import { app, BrowserWindow } from 'electron'
import { APP_UPDATE_STATUS_EVENT, type AppUpdateCheckStatus } from '../../shared/app-update-check'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'
import { isNewerRelease } from './release-tag-selection'
import {
  lookupLatestEnterpriseRelease,
  type ReleaseLookupResult
} from './enterprise-release-lookup'
import { readDismissedUpdateVersion, writeDismissedUpdateVersion } from './update-notice-dismissals'

// Late enough that a check never competes with window creation and first paint.
const FIRST_CHECK_DELAY_MS = 60_000
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

type ServiceOptions = {
  currentVersion?: () => string
  lookup?: typeof lookupLatestEnterpriseRelease
  isDisabled?: () => boolean
  broadcast?: (status: AppUpdateCheckStatus) => void
}

function broadcastToWindows(status: AppUpdateCheckStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(APP_UPDATE_STATUS_EVENT, status)
    }
  }
}

function currentAppVersion(): string {
  try {
    return app?.getVersion?.() ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export class AppUpdateCheckService {
  private status: AppUpdateCheckStatus = { state: 'unknown' }
  private timers: NodeJS.Timeout[] = []
  private inFlight: Promise<AppUpdateCheckStatus> | null = null
  private readonly options: Required<ServiceOptions>

  constructor(options: ServiceOptions = {}) {
    this.options = {
      currentVersion: options.currentVersion ?? currentAppVersion,
      lookup: options.lookup ?? lookupLatestEnterpriseRelease,
      isDisabled: options.isDisabled ?? (() => getEnterprisePolicy().disableAutoUpdate),
      broadcast: options.broadcast ?? broadcastToWindows
    }
  }

  /** Schedule the background checks. Safe to call when the policy forbids them. */
  start(): void {
    this.stop()
    this.timers.push(
      setTimeout(() => {
        void this.check()
      }, FIRST_CHECK_DELAY_MS),
      setInterval(() => {
        void this.check()
      }, RECHECK_INTERVAL_MS)
    )
    for (const timer of this.timers) {
      timer.unref?.()
    }
  }

  stop(): void {
    for (const timer of this.timers) {
      clearTimeout(timer)
      clearInterval(timer)
    }
    this.timers = []
  }

  getStatus(): AppUpdateCheckStatus {
    return this.options.isDisabled() ? { state: 'disabled' } : this.status
  }

  /** The chokepoint. Every path that would reach the corporate host comes through here. */
  check(): Promise<AppUpdateCheckStatus> {
    if (this.options.isDisabled()) {
      return Promise.resolve({ state: 'disabled' })
    }
    this.inFlight ??= this.runCheck().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  /** "Don't tell me about this one again." Newer releases still notify. */
  dismissVersion(version: string): AppUpdateCheckStatus {
    writeDismissedUpdateVersion(version)
    if (this.status.state === 'available' && this.status.latestVersion === version) {
      this.status = { ...this.status, dismissed: true }
    }
    return this.getStatus()
  }

  private async runCheck(): Promise<AppUpdateCheckStatus> {
    let result: ReleaseLookupResult
    try {
      result = await this.options.lookup({})
    } catch {
      // A lookup that throws instead of reporting is still just "no answer".
      result = { outcome: 'lookup-failed' }
    }
    const next = this.toStatus(result)
    const changed = JSON.stringify(next) !== JSON.stringify(this.status)
    this.status = next
    if (changed) {
      this.options.broadcast(next)
    }
    return next
  }

  private toStatus(result: ReleaseLookupResult): AppUpdateCheckStatus {
    const currentVersion = this.options.currentVersion()
    if (result.outcome !== 'found') {
      return { state: 'unavailable', reason: result.outcome }
    }
    const { release } = result
    if (!isNewerRelease(currentVersion, release.version)) {
      return { state: 'up-to-date', currentVersion, latestVersion: release.version }
    }
    return {
      state: 'available',
      currentVersion,
      latestVersion: release.version,
      releaseTag: release.tag,
      releaseUrl: result.releaseUrl,
      dismissed: readDismissedUpdateVersion() === release.version
    }
  }
}

let service: AppUpdateCheckService | null = null

export function getAppUpdateCheckService(): AppUpdateCheckService {
  service ??= new AppUpdateCheckService()
  return service
}

/** Test seam: drop the process-wide instance between cases. */
export function resetAppUpdateCheckServiceForTests(): void {
  service?.stop()
  service = null
}

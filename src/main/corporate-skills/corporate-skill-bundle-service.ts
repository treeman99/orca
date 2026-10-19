// The single lane into the corporate skill bundle, and therefore where
// `disableSkillBundleUpdate` is enforced.
//
// The gate sits on `check()` and `update()` rather than on the scheduler: the startup timer,
// the periodic re-check, and both renderer IPCs all reach the corporate host through these
// two methods, so gating `start()` alone would leave the IPC paths live.

import { BrowserWindow } from 'electron'
import { homedir } from 'node:os'
import {
  CORPORATE_SKILL_BUNDLE_STATUS_EVENT,
  type CorporateSkillBundleSkill,
  type CorporateSkillBundleStatus,
  type CorporateSkillBundleUpdateFailure,
  type CorporateSkillBundleUpdateResult
} from '../../shared/corporate-skill-bundle'
import type { AppUpdateLookupTarget } from '../../shared/app-update-check'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'
import { clearSkillDiscoveryCaches } from '../skills/skill-discovery-target'
import {
  lookupCorporateSkillBundle,
  resolveCorporateSkillBundleTarget,
  type CorporateBundleLookupResult,
  type CorporateRemoteBundle
} from './corporate-skill-bundle-remote'
import {
  corporateSkillHomeRoots,
  observeCorporateSkills
} from './corporate-skill-local-observation'
import {
  downloadCorporateSkillBundle,
  type CorporateSkillBundleFiles
} from './corporate-skill-bundle-download'
import {
  installCorporateSkillBundle,
  type CorporateSkillInstallOutcome
} from './corporate-skill-bundle-install'
import {
  readCorporateSkillBundleState,
  writeCorporateSkillBundleState,
  type CorporateSkillBundleState
} from './corporate-skill-bundle-state'

// Later than the release check's first read so the two `gh` lanes do not start together.
const FIRST_CHECK_DELAY_MS = 90_000
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export type CorporateSkillBundleServiceDeps = {
  isDisabled: () => boolean
  resolveTarget: () => AppUpdateLookupTarget
  lookup: () => Promise<CorporateBundleLookupResult>
  observe: (bundle: CorporateRemoteBundle) => Promise<CorporateSkillBundleSkill[]>
  download: (bundle: CorporateRemoteBundle) => Promise<CorporateSkillBundleFiles>
  install: (
    bundle: CorporateRemoteBundle,
    files: CorporateSkillBundleFiles
  ) => Promise<CorporateSkillInstallOutcome>
  readState: () => CorporateSkillBundleState
  writeState: (next: Partial<CorporateSkillBundleState>) => void
  broadcast: (status: CorporateSkillBundleStatus) => void
  /** Drop caches that would keep serving the pre-update skill list. */
  afterInstall: () => void
  now: () => number
}

function broadcastToWindows(status: CorporateSkillBundleStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(CORPORATE_SKILL_BUNDLE_STATUS_EVENT, status)
    }
  }
}

function defaultDeps(): CorporateSkillBundleServiceDeps {
  return {
    isDisabled: () => getEnterprisePolicy().disableSkillBundleUpdate,
    resolveTarget: resolveCorporateSkillBundleTarget,
    lookup: () => lookupCorporateSkillBundle(),
    observe: (bundle) => observeCorporateSkills(bundle.skills, corporateSkillHomeRoots()),
    download: (bundle) => downloadCorporateSkillBundle(bundle),
    install: (bundle, files) =>
      installCorporateSkillBundle({
        bundle,
        files,
        roots: corporateSkillHomeRoots(),
        homeDir: homedir(),
        // Same lock the freshness inventory reads (skill-lock-sources.ts).
        stateHome: process.env.XDG_STATE_HOME ?? null
      }),
    readState: readCorporateSkillBundleState,
    writeState: writeCorporateSkillBundleState,
    broadcast: broadcastToWindows,
    afterInstall: clearSkillDiscoveryCaches,
    now: Date.now
  }
}

/**
 * The status for an observed bundle. Pure, so the "when do we nudge" rule is testable.
 *
 * Nothing installed anywhere is not a stale install: that user never opted into the
 * bundle, and an unprompted offer to write into their home would be a surprise.
 */
export function deriveCorporateSkillBundleStatus(args: {
  bundle: CorporateRemoteBundle
  skills: CorporateSkillBundleSkill[]
  target: AppUpdateLookupTarget
  checkedAt: number
  dismissedCommit: string | null
}): CorporateSkillBundleStatus {
  const { bundle, skills } = args
  const observed = {
    target: args.target,
    checkedAt: args.checkedAt,
    branch: bundle.branch,
    commitSha: bundle.commitSha,
    skills
  }
  const placed = skills.some((skill) => skill.placements.some((p) => p.state !== 'missing'))
  if (!placed) {
    return { state: 'not-installed', ...observed }
  }
  // Links and blocked names are reported but never counted: the update will not write them.
  const changedNames = skills
    .filter((skill) =>
      skill.placements.some((p) => p.state === 'outdated' || p.state === 'missing')
    )
    .map((skill) => skill.name)
  if (changedNames.length === 0) {
    return { state: 'up-to-date', ...observed }
  }
  return {
    state: 'available',
    changedNames,
    dismissed: args.dismissedCommit === bundle.commitSha,
    ...observed
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class CorporateSkillBundleService {
  private status: CorporateSkillBundleStatus = { state: 'unknown' }
  private timers: NodeJS.Timeout[] = []
  private inFlight: Promise<CorporateSkillBundleStatus> | null = null
  private updating: Promise<CorporateSkillBundleUpdateResult> | null = null
  private readonly deps: CorporateSkillBundleServiceDeps

  constructor(deps: Partial<CorporateSkillBundleServiceDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps }
  }

  /** Schedule the background checks. Safe to call when the policy forbids them. */
  start(): void {
    this.stop()
    this.timers.push(
      setTimeout(() => void this.check(), FIRST_CHECK_DELAY_MS),
      setInterval(() => void this.check(), RECHECK_INTERVAL_MS)
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

  getStatus(): CorporateSkillBundleStatus {
    return this.deps.isDisabled() ? { state: 'disabled' } : this.status
  }

  /** Chokepoint for reads. Every path that would reach the corporate host comes through here. */
  check(): Promise<CorporateSkillBundleStatus> {
    if (this.deps.isDisabled()) {
      return Promise.resolve({ state: 'disabled' })
    }
    this.inFlight ??= this.runCheck().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  /** Chokepoint for writes: downloads the branch head and replaces the whole bundle. */
  update(): Promise<CorporateSkillBundleUpdateResult> {
    if (this.deps.isDisabled()) {
      return Promise.resolve(this.failure('disabled', 'Disabled by policy', { state: 'disabled' }))
    }
    if (this.updating) {
      return Promise.resolve(this.failure('busy', 'An update is already running', this.status))
    }
    this.updating = this.runUpdate().finally(() => {
      this.updating = null
    })
    return this.updating
  }

  /** "Don't tell me about this commit again." A later push notifies again. */
  dismiss(commitSha: string): CorporateSkillBundleStatus {
    if (!/^[0-9a-f]{40}$/.test(commitSha)) {
      return this.getStatus()
    }
    this.deps.writeState({ dismissedCommit: commitSha })
    if (this.status.state === 'available' && this.status.commitSha === commitSha) {
      this.publish({ ...this.status, dismissed: true })
    }
    return this.getStatus()
  }

  private failure(
    reason: CorporateSkillBundleUpdateFailure,
    message: string,
    status: CorporateSkillBundleStatus
  ): CorporateSkillBundleUpdateResult {
    return { ok: false, reason, message, status }
  }

  private publish(next: CorporateSkillBundleStatus): void {
    this.status = next
    this.deps.broadcast(next)
  }

  private async lookup(): Promise<CorporateBundleLookupResult> {
    try {
      return await this.deps.lookup()
    } catch {
      return { outcome: 'lookup-failed', target: this.deps.resolveTarget() }
    }
  }

  private async toStatus(result: CorporateBundleLookupResult): Promise<CorporateSkillBundleStatus> {
    const checkedAt = this.deps.now()
    if (result.outcome !== 'found') {
      return { state: 'unavailable', reason: result.outcome, target: result.target, checkedAt }
    }
    const { bundle } = result
    this.deps.writeState({ bundleNames: bundle.skills.map((skill) => skill.name) })
    return deriveCorporateSkillBundleStatus({
      bundle,
      skills: await this.deps.observe(bundle),
      target: result.target,
      checkedAt,
      dismissedCommit: this.deps.readState().dismissedCommit
    })
  }

  private async runCheck(): Promise<CorporateSkillBundleStatus> {
    let next: CorporateSkillBundleStatus
    try {
      next = await this.toStatus(await this.lookup())
    } catch {
      next = {
        state: 'unavailable',
        reason: 'lookup-failed',
        target: this.deps.resolveTarget(),
        checkedAt: this.deps.now()
      }
    }
    this.publish(next)
    return next
  }

  private async runUpdate(): Promise<CorporateSkillBundleUpdateResult> {
    const lookup = await this.lookup()
    if (lookup.outcome !== 'found') {
      const status = await this.toStatus(lookup)
      this.publish(status)
      return this.failure('lookup-failed', lookup.outcome, status)
    }
    let files: CorporateSkillBundleFiles
    try {
      files = await this.deps.download(lookup.bundle)
    } catch (error) {
      return this.failure('download-failed', errorMessage(error), this.status)
    }
    let outcome: CorporateSkillInstallOutcome
    try {
      outcome = await this.deps.install(lookup.bundle, files)
    } catch (error) {
      outcome = { installedNames: [], skippedPaths: [], errors: [errorMessage(error)] }
    }
    this.deps.afterInstall()
    const status = await this.toStatus(lookup)
    this.publish(status)
    if (outcome.errors.length > 0) {
      return this.failure('write-failed', outcome.errors.join('\n'), status)
    }
    return {
      ok: true,
      commitSha: lookup.bundle.commitSha,
      installedNames: outcome.installedNames,
      skippedPaths: outcome.skippedPaths,
      status
    }
  }
}

let service: CorporateSkillBundleService | null = null

export function getCorporateSkillBundleService(): CorporateSkillBundleService {
  service ??= new CorporateSkillBundleService()
  return service
}

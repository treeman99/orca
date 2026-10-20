// Fork-only: the corporate skill bundle lane's wire shape, shared by main, preload, and the
// renderer.
//
// The fleet's orchestration/orca-cli skills are not the ones this build ships: they come
// from a skill repository on the corporate GitHub Enterprise host, which also carries the
// skills orchestration delegates to. The lane compares what is installed against that
// repository's bundle branch and, on request, replaces every skill of the bundle at once —
// a partial update would leave orchestration pointing at helper skills of another revision.

import type { AppUpdateLookupTarget } from './app-update-check'

/** Where the fleet's skills live. Same coordinate as the help menu's "Download Skills". */
export const CORPORATE_SKILL_BUNDLE_REPOSITORY = 'daegun-kim/ORCA_skill'

/**
 * The corporate repository's bundle branch (`docs/` + `skills/<name>/`). Read by name, never
 * via "the default branch": a default that moves to a branch of upstream originals must not
 * get those offered as an update over the fleet's customized skills.
 */
export const CORPORATE_SKILL_BUNDLE_BRANCH = 'main'

/** The channel main pushes a fresh status on. */
export const CORPORATE_SKILL_BUNDLE_STATUS_EVENT = 'corporateSkillBundle:status'

/** The two homes the bundle's install instructions require. */
export type CorporateSkillHome = 'agents' | 'claude'

export type CorporateSkillPlacementState =
  | 'current'
  | 'outdated'
  | 'missing'
  /** A symlink or junction. Never written through: its target may be someone else's. */
  | 'link'
  /** Something other than a folder holds the name. */
  | 'blocked'

export type CorporateSkillPlacement = {
  home: CorporateSkillHome
  path: string
  state: CorporateSkillPlacementState
}

export type CorporateSkillBundleSkill = {
  name: string
  placements: CorporateSkillPlacement[]
}

export type CorporateSkillBundleUnavailableReason =
  /** No corporate GitHub Enterprise host is configured, or it resolved to vendor SaaS. */
  | 'no-enterprise-host'
  /** `gh` is missing, unauthenticated, cannot read the repository, or the host did not answer. */
  | 'lookup-failed'
  /** The repository answered, but the bundle branch has no usable `skills/` folder. */
  | 'no-bundle'

type CheckedFields = {
  target: AppUpdateLookupTarget
  /** When the check that produced this status finished (epoch ms). */
  checkedAt: number
}

type RememberedFields = {
  /**
   * The names the last successful check found in the bundle. A failed or pending check
   * still owns them: falling back to the build's own update would overwrite them with stubs.
   */
  managedNames?: string[]
}

type ObservedFields = CheckedFields & {
  branch: string
  commitSha: string
  skills: CorporateSkillBundleSkill[]
}

export type CorporateSkillBundleStatus =
  /** The administrator's `disableSkillBundleUpdate` is on. */
  | { state: 'disabled' }
  /** Nothing has been checked yet in this session. */
  | ({ state: 'unknown' } & RememberedFields)
  | ({
      state: 'unavailable'
      reason: CorporateSkillBundleUnavailableReason
    } & CheckedFields &
      RememberedFields)
  /** No skill of the bundle is installed anywhere — offered, never nudged. */
  | ({ state: 'not-installed' } & ObservedFields)
  | ({ state: 'up-to-date' } & ObservedFields)
  | ({
      state: 'available'
      /** Skills with a stale or missing copy; the update still rewrites the whole bundle. */
      changedNames: string[]
      /** The user closed the notice for this commit. */
      dismissed: boolean
    } & ObservedFields)

export type CorporateSkillBundleUpdateFailure =
  | 'disabled'
  | 'busy'
  | 'lookup-failed'
  | 'download-failed'
  | 'write-failed'

export type CorporateSkillBundleUpdateResult =
  | {
      ok: true
      commitSha: string
      installedNames: string[]
      /** Placements left alone because writing them could touch files Orca does not own. */
      skippedPaths: string[]
      status: CorporateSkillBundleStatus
    }
  | {
      ok: false
      reason: CorporateSkillBundleUpdateFailure
      message: string
      status: CorporateSkillBundleStatus
    }

/** `https://<host>/<OWNER>/<REPO>` — what the lane writes as the lock entry's `source`. */
export function corporateSkillBundleSource(host: string, repository: string): string {
  return `https://${host}/${repository}`
}

/** Whether a skills.sh lock `source` names the corporate skill repository. */
export function isCorporateSkillBundleSource(
  source: string | null,
  repository: string = CORPORATE_SKILL_BUNDLE_REPOSITORY
): boolean {
  if (!source) {
    return false
  }
  const normalized = source
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
  return normalized.endsWith(`/${repository.toLowerCase()}`)
}

/** The skill names the bundle owns, by its latest check or, failing that, its last good one. */
export function corporateSkillBundleOwnedNames(status: CorporateSkillBundleStatus): string[] {
  if ('skills' in status) {
    return status.skills.map((skill) => skill.name)
  }
  return status.state === 'disabled' ? [] : (status.managedNames ?? [])
}

// Which of Orca's own skill setup surfaces the corporate skill bundle has taken over.
//
// orchestration and orca-cli ship inside this build AND in the bundle. Where the bundle owns
// a name, the build's freshness badge and its Update button would judge — and overwrite —
// the fleet's customized copy against this build's stub, so those surfaces defer to the lane.

import {
  corporateSkillBundleOwnedNames,
  type CorporateSkillBundleStatus
} from '../../../../shared/corporate-skill-bundle'
import {
  useCorporateSkillBundle,
  type CorporateSkillBundleSnapshot
} from './corporate-skill-bundle-store'

export type OwnedCorporateSkillBundle = CorporateSkillBundleSnapshot & {
  status: CorporateSkillBundleStatus
  ownedNames: string[]
}

export function ownedCorporateSkillBundle(
  snapshot: CorporateSkillBundleSnapshot,
  skillName: string | undefined
): OwnedCorporateSkillBundle | null {
  const { status } = snapshot
  if (!status || !skillName) {
    return null
  }
  const ownedNames = corporateSkillBundleOwnedNames(status)
  return ownedNames.includes(skillName) ? { ...snapshot, status, ownedNames } : null
}

/** The lane's view when it owns `skillName`; null hands the surface back to the build. */
export function useCorporateSkillBundleOwner(
  skillName: string | undefined
): OwnedCorporateSkillBundle | null {
  return ownedCorporateSkillBundle(useCorporateSkillBundle(), skillName)
}

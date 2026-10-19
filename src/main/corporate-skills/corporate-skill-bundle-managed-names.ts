// Keeps the build's own skill freshness check off the skills the corporate bundle owns.
//
// That check compares a skill against the copy this build ships and offers to overwrite
// any difference — which, for the bundle's customized orchestration/orca-cli, means "go
// back to the stub". The bundle's own lane judges those names against the corporate host.

import type { SkillBundleManifest } from '../../shared/skill-freshness'
import { isCorporateSkillBundleSource } from '../../shared/corporate-skill-bundle'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'
import { readCorporateSkillBundleState } from './corporate-skill-bundle-state'

/**
 * Names the bundle owns: the ones Orca installed from it (per the lock) plus the ones the
 * last successful check found in it. Empty when the administrator turned the lane off,
 * which puts the build's own check back in charge of every name.
 */
export function corporateBundleManagedNames(
  lockSources: ReadonlyMap<string, string>,
  rememberedNames: () => readonly string[] = () => readCorporateSkillBundleState().bundleNames
): Set<string> {
  if (getEnterprisePolicy().disableSkillBundleUpdate) {
    return new Set()
  }
  const names = new Set(rememberedNames())
  for (const [name, source] of lockSources) {
    if (isCorporateSkillBundleSource(source)) {
      names.add(name)
    }
  }
  return names
}

export function withoutCorporateBundleSkills(
  manifest: SkillBundleManifest,
  lockSources: ReadonlyMap<string, string>
): SkillBundleManifest {
  const managed = corporateBundleManagedNames(lockSources)
  return managed.size === 0
    ? manifest
    : { ...manifest, skills: manifest.skills.filter((skill) => !managed.has(skill.name)) }
}

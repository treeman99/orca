// Startup entry point for the bundled-skill reconcile. Kept separate from the logic so the
// logic stays free of electron and testable with plain paths.
//
// Packaged builds only. A dev checkout shares a machine with whatever Orca the developer has
// actually installed, and refreshing `~/.claude/skills` from an unreleased tree would swap
// their working skills out from under them. `orca skills install` stays the dev path.

import { app } from 'electron'
import { homedir } from 'node:os'
import { autoInstallBundledSkills } from './bundled-skill-auto-install'
import { loadSkillBundleArtifacts } from './skill-bundle-artifacts'
import { resolveBundledSkillPackageRoot } from '../../shared/bundled-skill-package-source'

export type BundledSkillAutoInstallLog = {
  info(message: string): void
  warn(message: string, error?: unknown): void
}

const consoleLog: BundledSkillAutoInstallLog = {
  info: (message) => console.log(`[skills] ${message}`),
  warn: (message, error) => console.warn(`[skills] ${message}`, error ?? '')
}

/**
 * Place every skill this build ships into the agent homes present on the machine.
 *
 * Never rejects: a failure here must not take down app startup, and the same reconcile runs
 * again on the next launch. Callers fire and forget.
 */
export async function runBundledSkillAutoInstall(
  options: { log?: BundledSkillAutoInstallLog } = {}
): Promise<void> {
  const log = options.log ?? consoleLog
  if (!app.isPackaged) {
    return
  }
  try {
    const [packageRoot] = resolveBundledSkillPackageRoot({
      resourcesPath: process.resourcesPath,
      repoRoot: null
    })
    if (!packageRoot) {
      return
    }
    const artifacts = await loadSkillBundleArtifacts()
    const names = artifacts.manifest.skills.map((skill) => skill.name)
    if (names.length === 0) {
      return
    }
    const result = await autoInstallBundledSkills({
      names,
      packageRoot,
      homeDir: homedir(),
      stateHome: process.env.XDG_STATE_HOME ?? null
    })
    const placed = result.decisions.filter((decision) => decision.decision === 'installed')
    const kept = result.decisions.filter((decision) => decision.decision === 'kept-user-copy')
    if (placed.length > 0) {
      log.info(`auto-installed ${placed.length} bundled skill placement(s)`)
    }
    if (kept.length > 0) {
      // Not a warning: an edited skill is a deliberate act, and saying so is how the user
      // learns why a bundled update did not reach that copy.
      log.info(`left ${kept.length} locally modified skill copy/copies untouched`)
    }
    for (const failure of result.errors) {
      log.warn(`could not place bundled skill ${failure.name}: ${failure.message}`)
    }
  } catch (error) {
    log.warn('bundled skill auto-install did not run', error)
  }
}

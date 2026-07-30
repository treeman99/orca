import { mkdirSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const RESTRICTED_ENV_KEYS = new Set([
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'CODEX_HOME',
  'ORCA_CODEX_HOME',
  'ORCA_CODEX_SYSTEM_DEFAULT_REAL_HOME',
  'ORCA_E2E_USER_DATA_DIR',
  'ORCA_E2E_HOME_DIR',
  'ZDOTDIR',
  'ORCA_ORIG_ZDOTDIR',
  'BASH_ENV',
  'ENV'
])

// Why: the machines that build this fork ship a machine-wide enterprise policy
// file, and unlike vitest (config/vitest-enterprise-policy-isolation.ts) the
// E2E suite spawns real Electron children that would inherit it — silently
// running every spec under lockdown. `off` neutralizes discovery entirely,
// which stripping the variable alone cannot do: the machine-wide path is
// searched regardless. Honored because an E2E launch is unpackaged, and
// enterprise-policy-file.ts refuses the env override only when `isPackaged`.
// GH_HOST rides along because it feeds the same policy's GHES host fallback.
const ENTERPRISE_POLICY_PATH_ENV = 'ORCA_ENTERPRISE_POLICY'
const ENTERPRISE_POLICY_DISABLED_VALUE = 'off'
// Unlike RESTRICTED_ENV_KEYS these are neutralized, not forbidden — a spec may
// still set either deliberately through launchEnv/extraEnv to cover the
// locked-down behavior itself.
// GH_CONFIG_DIR rides along for the same reason: the GHES host also falls back to the single
// host gh's own config names, so a developer's ~/.config/gh must not reach a spawned child.
const NEUTRALIZED_HOST_ENV_KEYS = new Set([
  ENTERPRISE_POLICY_PATH_ENV,
  'GH_HOST',
  'GH_CONFIG_DIR',
  'XDG_CONFIG_HOME'
])

type ElectronHomeIsolationOptions = {
  inheritedEnv: NodeJS.ProcessEnv
  launchEnv: NodeJS.ProcessEnv
  extraEnv: Record<string, string>
  userDataDir: string
  codexRealHomeEnabled: boolean
  realHome?: string
}

export type ElectronHomeIsolation = {
  env: NodeJS.ProcessEnv
  isolatedHome: string
  realHome: string
}

function normalizeComparablePath(candidatePath: string, platform = process.platform): string {
  const normalized = path.resolve(candidatePath)
  return platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function areSameHomePath(left: string, right: string, platform = process.platform): boolean {
  return normalizeComparablePath(left, platform) === normalizeComparablePath(right, platform)
}

function assertOverlayDoesNotReplaceIsolation(
  overlay: NodeJS.ProcessEnv | Record<string, string>,
  overlayName: string
): void {
  const restrictedKey = Object.keys(overlay).find((key) =>
    RESTRICTED_ENV_KEYS.has(key.toUpperCase())
  )
  if (restrictedKey) {
    throw new Error(
      `${overlayName}.${restrictedKey} cannot override the E2E home boundary; use codexRealHomeEnabled for sandboxed real-home coverage`
    )
  }
}

function stripAmbientHostEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        !RESTRICTED_ENV_KEYS.has(key.toUpperCase()) &&
        !NEUTRALIZED_HOST_ENV_KEYS.has(key.toUpperCase())
    )
  )
}

export function createElectronHomeIsolation({
  inheritedEnv,
  launchEnv,
  extraEnv,
  userDataDir,
  codexRealHomeEnabled,
  realHome = os.homedir()
}: ElectronHomeIsolationOptions): ElectronHomeIsolation {
  assertOverlayDoesNotReplaceIsolation(launchEnv, 'launchEnv')
  assertOverlayDoesNotReplaceIsolation(extraEnv, 'orcaAppExtraEnv')

  const requestedIsolatedHome = path.join(userDataDir, 'home')
  mkdirSync(requestedIsolatedHome, { recursive: true, mode: 0o700 })
  // Why: tmpdir-rooted paths are aliases (macOS /var symlink, Windows 8.3
  // short names). Git canonicalizes worktree paths, so a non-canonical HOME
  // makes freshly created worktrees invisible to Orca's listing comparisons.
  const isolatedHome = realpathSync.native(requestedIsolatedHome)
  // Why: a bad fixture path must fail before Electron can resolve a real Codex
  // home; userData isolation alone does not change app.getPath('home').
  if (areSameHomePath(isolatedHome, realHome)) {
    throw new Error('Refusing to launch E2E with the developer home as its isolated HOME')
  }

  return {
    isolatedHome,
    realHome,
    env: {
      ...stripAmbientHostEnv(inheritedEnv),
      [ENTERPRISE_POLICY_PATH_ENV]: ENTERPRISE_POLICY_DISABLED_VALUE,
      ...launchEnv,
      ...extraEnv,
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
      ORCA_E2E_USER_DATA_DIR: userDataDir,
      ORCA_E2E_HOME_DIR: isolatedHome,
      ORCA_CODEX_SYSTEM_DEFAULT_REAL_HOME: codexRealHomeEnabled ? '1' : '0'
    }
  }
}

export function assertElectronResolvedIsolatedHome(
  actualHome: string,
  isolation: Pick<ElectronHomeIsolation, 'isolatedHome' | 'realHome'>
): void {
  if (
    !areSameHomePath(actualHome, isolation.isolatedHome) ||
    areSameHomePath(actualHome, isolation.realHome)
  ) {
    // Why: a failed safety assertion can land in shared CI artifacts; do not
    // print a developer username or native home path while reporting it.
    throw new Error('Electron E2E HOME escaped the disposable profile boundary')
  }
}

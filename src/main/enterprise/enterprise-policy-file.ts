// Discovery and caching for the corporate policy file described in
// src/shared/enterprise-policy.ts.
//
// The fork exposes exactly one environment variable, ORCA_ENTERPRISE_POLICY,
// and it only ever names a location. Everything else is a key in the file, so a
// locked-down deployment does not have to push a dozen variables into every
// spawned agent, `gh`, `git`, and unrelated tooling on the same machine.
//
// The machine-wide path is searched before the per-user one on purpose: on
// Windows, per-user state (what `setx` writes) leaves every other profile,
// service account, and freshly created profile on the box unlocked.
//
// A packaged build also carries a default policy in its own resources, so
// installing the corporate `.exe` locks the machine down with no separate
// deployment step. It sits BELOW the machine-wide path (an administrator can
// still override centrally) and ABOVE both the env path and the per-user file
// (neither of which a standard user may use to undercut the shipped default).

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { parse as parseJsonc, type ParseError } from 'jsonc-parser'
import { applyEnterprisePolicyBaseline } from '../../shared/enterprise-policy-baseline'
import { registerCorporateLlmEndpoints } from '../../shared/corporate-llm-session-catalog'
import { readGhConfiguredHost } from '../github/gh-config-host'
import {
  resolveEnterprisePolicy,
  type EnterprisePolicy,
  type PolicyEnv
} from '../../shared/enterprise-policy'

export const ENTERPRISE_POLICY_PATH_ENV = 'ORCA_ENTERPRISE_POLICY'
export const ENTERPRISE_POLICY_FILE_NAME = 'enterprise-policy.json'

// Explicit "there is no policy here" values, so a test runner or a CI image can
// neutralize a machine-wide file without deleting it.
const DISABLED_VALUES: ReadonlySet<string> = new Set(['off', 'none', 'disabled', 'false', '0'])

// True when the environment switched discovery off and this build honors that. Callers use
// it to skip deriving policy *inputs* too — half-applying a policy that was turned off is
// worse than not having one.
function policyDiscoveryDisabled(env: PolicyEnv, allowEnvOverride: boolean): boolean {
  const explicit = env[ENTERPRISE_POLICY_PATH_ENV]?.trim()
  return allowEnvOverride && explicit !== undefined && DISABLED_VALUES.has(explicit.toLowerCase())
}

// Why: `platform` is not always the host's (tests, and the Windows machines that
// build this fork run the suite for every platform), so join with that
// platform's separator instead of the host's.
function pathFor(platform: NodeJS.Platform): typeof path {
  return platform === 'win32' ? path.win32 : path.posix
}

function machineWidePolicyPath(platform: NodeJS.Platform, env: PolicyEnv): string | null {
  const platformPath = pathFor(platform)
  if (platform === 'win32') {
    const programData = env.ProgramData ?? env.PROGRAMDATA
    return programData ? platformPath.join(programData, 'Orca', ENTERPRISE_POLICY_FILE_NAME) : null
  }
  if (platform === 'darwin') {
    return platformPath.join('/Library', 'Application Support', 'Orca', ENTERPRISE_POLICY_FILE_NAME)
  }
  return platformPath.join('/etc', 'orca', ENTERPRISE_POLICY_FILE_NAME)
}

/**
 * Ordered candidate locations. The first one that parses wins outright — a
 * per-user file can relax neither a machine-wide one nor the bundled default.
 *
 * `allowEnvOverride` is false for a packaged build, and that is the security
 * boundary: on Windows any standard user can `setx ORCA_ENTERPRISE_POLICY off`
 * for their own account, so in a shipped build the environment may only ADD a
 * lower-priority candidate — it can never redirect away from, or switch off,
 * the machine-wide file an administrator deployed.
 *
 * `bundledPolicyPath` is the build's own default (see `getEnterprisePolicy`).
 * It ranks differently in the two modes on purpose. In a packaged build it sits
 * above everything a standard user can write. In an unpackaged one it is the
 * LAST resort, below both the machine-wide file and the developer's own per-user
 * one — enough to make `pnpm dev` of this fork show the fleet's UI without any
 * setup (which is what made "codex is still listed" so easy to misread), while a
 * local override and `ORCA_ENTERPRISE_POLICY=off` both still win. vitest and the
 * E2E harness set that opt-out, so the suite never picks up the lockdown.
 */
export function enterprisePolicySearchPaths(
  env: PolicyEnv,
  platform: NodeJS.Platform,
  userDataDir: string | null,
  allowEnvOverride = true,
  bundledPolicyPath: string | null = null
): string[] {
  const explicit = env[ENTERPRISE_POLICY_PATH_ENV]?.trim()
  const disabled = explicit !== undefined && DISABLED_VALUES.has(explicit.toLowerCase())
  const explicitPath = explicit && !disabled ? explicit : null
  if (allowEnvOverride) {
    if (disabled) {
      return []
    }
    if (explicitPath) {
      return [explicitPath]
    }
  }
  const perUser = userDataDir
    ? pathFor(platform).join(userDataDir, ENTERPRISE_POLICY_FILE_NAME)
    : null
  const candidates = allowEnvOverride
    ? [machineWidePolicyPath(platform, env), perUser, bundledPolicyPath]
    : [machineWidePolicyPath(platform, env), bundledPolicyPath, explicitPath, perUser]
  return candidates.filter((candidate): candidate is string => candidate !== null)
}

// A UTF-16LE file read as UTF-8: the byte-order mark decodes to two U+FFFD.
const UTF16LE_MISREAD_PREFIX = '\uFFFD\uFFFD'

// Bounded: a document with hundreds of unknown keys must not pin memory.
const MAX_BUFFERED_NOTICES = 32

let searchedPaths: readonly string[] = []
let notices: string[] = []
let baselinePath: string | null = null
let baselineAppliedKeys: readonly string[] = []

// Why: a Start-Menu-launched Windows GUI process has no console, so Node hands
// fd 2 a contentless stub and every one of these vanishes. Keep the write for
// dev/CLI shells and buffer for the trace sink, which only exists later in
// startup (see enterprise-policy-trace.ts).
function warn(message: string): void {
  process.stderr.write(`[enterprise-policy] ${message}\n`)
  if (notices.length < MAX_BUFFERED_NOTICES) {
    notices.push(message)
  }
}

export type EnterprisePolicyResolutionTrace = {
  /** Candidates discovery walked, in order — an admin's "why was my file ignored". */
  readonly searchedPaths: readonly string[]
  /** Every diagnostic `warn()` produced while resolving, in emission order. */
  readonly notices: readonly string[]
  /** The build's own policy file, when it acted as the floor under another one. */
  readonly baselinePath: string | null
  /** Keys that floor actually contributed — "why is this on when my file never said so". */
  readonly baselineAppliedKeys: readonly string[]
}

/** What discovery actually did on this launch, for the durable trace record. */
export function getEnterprisePolicyResolutionTrace(): EnterprisePolicyResolutionTrace {
  return { searchedPaths, notices, baselinePath, baselineAppliedKeys }
}

type LoadedDocument = { document: unknown; sourcePath: string }

function isPolicyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One candidate's parsed document, or null when it is missing, unreadable, or unusable. */
function readOnePolicyDocument(candidate: string): unknown {
  {
    let contents: string
    try {
      contents = readFileSync(candidate, 'utf8')
      // Why: Windows PowerShell 5.1's `Out-File`/`>` default to UTF-16LE, which
      // decodes as two replacement chars followed by NUL-interleaved text — the
      // file is fine, only the decoder was wrong, so re-read it properly.
      if (contents.startsWith(UTF16LE_MISREAD_PREFIX)) {
        contents = readFileSync(candidate, 'utf16le')
      }
    } catch (error) {
      // Why: a missing file is the normal case for non-corporate installs, but an
      // unreadable one (permissions, corrupt mount) must not look identical to it.
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        warn(`could not read ${candidate}: ${String(error)}`)
      }
      return null
    }
    const errors: ParseError[] = []
    // Why: Windows admin tooling (Notepad, PowerShell 5.1 Out-File/Set-Content)
    // writes a UTF-8 BOM, and jsonc-parser reports it as a parse error — without
    // stripping it a perfectly good policy file is discarded whole.
    const document = parseJsonc(contents.replace(/^\uFEFF/, ''), errors, {
      allowTrailingComma: true
    })
    if (errors.length > 0) {
      // Why not give up here: with a bundled default below it, one typo in a
      // centrally-deployed file used to leave that machine COMPLETELY unlocked.
      // Reporting it unusable keeps the shipped lockdown — loudly, so an
      // administrator still learns their file was ignored.
      warn(`${candidate} is not valid JSON; ignoring it.`)
      return null
    }
    // Why this too: `null`, `[]`, `"x"` and `42` are all valid JSON, so a file whose
    // CONTENTS are wrong used to win the search outright and shut out every candidate
    // below it. The resolver's own object check sits downstream of that choice, where
    // falling back to the bundled default is no longer possible.
    if (!isPolicyObject(document)) {
      warn(`${candidate} does not contain a JSON object; ignoring it.`)
      return null
    }
    return document
  }
}

function readPolicyDocument(candidates: string[]): LoadedDocument | null {
  for (const candidate of candidates) {
    const document = readOnePolicyDocument(candidate)
    if (document !== null) {
      return { document, sourcePath: candidate }
    }
  }
  return null
}

function currentUserDataDir(): string | null {
  try {
    return app?.getPath?.('userData') ?? null
  } catch {
    // Electron is absent (unit tests) or userData is not resolvable yet.
    return null
  }
}

// A shipped build must not let a per-user environment variable disarm a
// machine-wide policy; `isPackaged` is the one signal a standard user cannot set.
function environmentMayOverridePolicy(): boolean {
  try {
    return app?.isPackaged !== true
  } catch {
    return true
  }
}

// The default shipped inside the installer, beside the other extraResources.
// Absent in dev/vitest, where `process.resourcesPath` is Electron's own bundle
// or undefined — so this is only ever consulted for a packaged build.
function packagedBundledPolicyPath(): string | null {
  // `resourcesPath` is already a host-native path, so join with the host's separator.
  return process.resourcesPath
    ? path.join(process.resourcesPath, ENTERPRISE_POLICY_FILE_NAME)
    : null
}

// The same default, read from the checkout `pnpm dev` is running — `resources/` is
// exactly what the installer copies to `resourcesPath`. Without it an unpackaged run
// of this fork resolved NO policy at all, so every screen looked upstream (all the
// agent pickers, vendor accounts, mobile) and a dev check "proved" a gate was broken
// that in fact never had a policy to apply.
//
// Measured, not assumed: electron-vite spawns `electron out/main/index.js`, and Electron
// then reports the ENTRY's directory as the app path — so getAppPath() is `<checkout>/out/main`
// and joining `resources/` onto it silently finds nothing. A plain `electron .` launch
// reports the checkout itself, so only trim the suffix when it is really there.
const DEV_MAIN_BUNDLE_DIR = path.join('out', 'main')

function devCheckoutPolicyPath(): string | null {
  try {
    const appPath = app?.getAppPath?.()
    if (!appPath) {
      // Electron is absent (unit tests): no checkout default, so the suite stays upstream.
      return null
    }
    const checkoutRoot = appPath.endsWith(DEV_MAIN_BUNDLE_DIR)
      ? path.resolve(appPath, '..', '..')
      : appPath
    return path.join(checkoutRoot, 'resources', ENTERPRISE_POLICY_FILE_NAME)
  } catch {
    return null
  }
}

/**
 * Put the build's own policy under the adopted one as a floor (see
 * enterprise-policy-baseline.ts for why it may only ever restrict).
 *
 * Skipped when the bundled file IS the adopted one — merging a document with itself would
 * only make the trace claim contributions nobody made.
 */
function applyBundledBaseline(loaded: LoadedDocument | null, bundled: string | null): unknown {
  baselinePath = null
  baselineAppliedKeys = []
  if (!loaded || !bundled || loaded.sourcePath === bundled) {
    return loaded?.document ?? null
  }
  const baseline = readOnePolicyDocument(bundled)
  if (baseline === null) {
    return loaded.document
  }
  const { document, appliedKeys } = applyEnterprisePolicyBaseline(loaded.document, baseline)
  if (appliedKeys.length > 0) {
    baselinePath = bundled
    baselineAppliedKeys = appliedKeys
    // Why loud: this is the one case where a switch is on that the administrator's own file
    // never mentions, and "my GPO file says nothing about agents" is precisely the report
    // that sent this fork chasing UI bugs for a week.
    warn(`${loaded.sourcePath} does not set ${appliedKeys.join(', ')}; kept from ${bundled}.`)
  }
  return document
}

let cached: EnterprisePolicy | null = null

/**
 * The effective policy for this process. Resolved once and cached: it is read on
 * hot paths (every Gitea ref parse, every consent check) and an administrator
 * changing the file mid-session should not half-apply.
 */
export function getEnterprisePolicy(): EnterprisePolicy {
  if (cached) {
    return cached
  }
  const env = process.env as PolicyEnv
  const allowEnvOverride = environmentMayOverridePolicy()
  const bundledPath = allowEnvOverride ? devCheckoutPolicyPath() : packagedBundledPolicyPath()
  const candidates = enterprisePolicySearchPaths(
    env,
    process.platform,
    currentUserDataDir(),
    allowEnvOverride,
    bundledPath
  )
  searchedPaths = candidates
  const loaded = readPolicyDocument(candidates)
  const baselined = applyBundledBaseline(loaded, bundledPath)
  // Why read gh's config at all: a GUI-launched app never inherits a shell rc, so `GH_HOST`
  // is routinely absent on exactly the machines that DID run `gh auth login --hostname`.
  const policy = resolveEnterprisePolicy(
    baselined,
    env,
    loaded?.sourcePath ?? null,
    policyDiscoveryDisabled(env, allowEnvOverride)
      ? () => null
      : () => readGhConfiguredHost(env, process.platform)
  )
  for (const message of policy.warnings) {
    warn(`${loaded?.sourcePath ?? '(no file)'}: ${message}`)
  }
  // Why: main builds launch plans too (CLI, mobile, background sessions), and
  // without this a persisted corporate model id would be passed to the agent's
  // --model flag instead of resolving to the endpoint's environment.
  registerCorporateLlmEndpoints(policy.llmEndpoints)
  cached = policy
  return policy
}

/** Exposed for tests only — clears the one-shot cache between cases. */
export function resetEnterprisePolicyCacheForTests(): void {
  cached = null
  searchedPaths = []
  notices = []
  baselinePath = null
  baselineAppliedKeys = []
}

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

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { parse as parseJsonc, type ParseError } from 'jsonc-parser'
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
 * Ordered candidate locations. The first file that exists wins outright — a
 * per-user file cannot relax a machine-wide one.
 *
 * `allowEnvOverride` is false for a packaged build, and that is the security
 * boundary: on Windows any standard user can `setx ORCA_ENTERPRISE_POLICY off`
 * for their own account, so in a shipped build the environment may only ADD a
 * lower-priority candidate — it can never redirect away from, or switch off,
 * the machine-wide file an administrator deployed.
 */
export function enterprisePolicySearchPaths(
  env: PolicyEnv,
  platform: NodeJS.Platform,
  userDataDir: string | null,
  allowEnvOverride = true
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
    ? [machineWidePolicyPath(platform, env), perUser]
    : [machineWidePolicyPath(platform, env), explicitPath, perUser]
  return candidates.filter((candidate): candidate is string => candidate !== null)
}

// A UTF-16LE file read as UTF-8: the byte-order mark decodes to two U+FFFD.
const UTF16LE_MISREAD_PREFIX = '\uFFFD\uFFFD'

// Bounded: a document with hundreds of unknown keys must not pin memory.
const MAX_BUFFERED_NOTICES = 32

let searchedPaths: readonly string[] = []
let notices: string[] = []

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
}

/** What discovery actually did on this launch, for the durable trace record. */
export function getEnterprisePolicyResolutionTrace(): EnterprisePolicyResolutionTrace {
  return { searchedPaths, notices }
}

type LoadedDocument = { document: unknown; sourcePath: string }

function readPolicyDocument(candidates: string[]): LoadedDocument | null {
  for (const candidate of candidates) {
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
      continue
    }
    const errors: ParseError[] = []
    // Why: Windows admin tooling (Notepad, PowerShell 5.1 Out-File/Set-Content)
    // writes a UTF-8 BOM, and jsonc-parser reports it as a parse error — without
    // stripping it a perfectly good policy file is discarded whole.
    const document = parseJsonc(contents.replace(/^\uFEFF/, ''), errors, {
      allowTrailingComma: true
    })
    if (errors.length > 0) {
      warn(`${candidate} is not valid JSON; ignoring it.`)
      return null
    }
    return { document, sourcePath: candidate }
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
  const candidates = enterprisePolicySearchPaths(
    env,
    process.platform,
    currentUserDataDir(),
    allowEnvOverride
  )
  searchedPaths = candidates
  const loaded = readPolicyDocument(candidates)
  // Why read gh's config at all: a GUI-launched app never inherits a shell rc, so `GH_HOST`
  // is routinely absent on exactly the machines that DID run `gh auth login --hostname`.
  const policy = resolveEnterprisePolicy(
    loaded?.document ?? null,
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
}

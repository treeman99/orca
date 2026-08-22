// Central policy for locked-down corporate deployments (e.g. behind a private
// GitHub Enterprise host with no access to vendor SaaS endpoints).
//
// Why a file instead of environment variables: anything Orca reads from `env` is
// also inherited by every process it spawns — agent CLIs, `gh`, `git`, the relay —
// and a machine-wide `setx` leaks into unrelated tooling on the same box. So the
// fork adds exactly ONE environment variable (the policy file's location) and
// keeps every switch inside an administrator-owned JSON file.
//
// This module is a pure function of the already-parsed document so it is
// trivially testable; discovery and file I/O live in src/main/enterprise/.

export type EnterprisePolicy = {
  /** Master switch. When on, every non-essential vendor phone-home defaults off. */
  lockdown: boolean
  /** Suppress PostHog telemetry and the diagnostics/crash bundle upload lane. */
  disableTelemetry: boolean
  /**
   * Suppress the update-availability check against the corporate GitHub Enterprise
   * host, and with it the "a newer release exists" dialog.
   *
   * Fork: this build has no in-app updater — nothing downloads, installs, or
   * replaces the app, and `electron-updater` is not a dependency. The only thing
   * this switch turns off is a `gh api` read of the release tags in
   * `updateReleaseRepository` plus the notification it feeds. Off by default under
   * `lockdown` because a fleet on staged corporate software distribution should not
   * be told to go fetch a build itself.
   */
  disableAutoUpdate: boolean
  /** Suppress the "star stablyai/orca" check/write that hits github.com SaaS. */
  disableStarNag: boolean
  /** Suppress Orca Cloud sign-in and the vendor-hosted mobile pairing relay. */
  disableCloudRelay: boolean
  /** Suppress AI-vendor usage/rate-limit polling (api.anthropic.com and friends). */
  disableUsagePolling: boolean
  /**
   * Suppress Orca's managed Claude accounts: the OAuth token rotation against
   * platform.claude.com, and the agent-environment rewriting that strips AWS
   * Bedrock credentials on the way to the PTY. On a Bedrock fleet the feature is
   * both an egress path and a functional hazard.
   */
  disableManagedClaudeAccounts: boolean
  /** Turn off Chromium's spellchecker, which downloads dictionaries from a CDN. */
  disableSpellcheck: boolean
  /**
   * Refuse mobile pairing outright. `disableCloudRelay` only removes the vendor-hosted
   * relay; the LAN/Tailscale offer keeps working without it, so a locked-down machine
   * still hands out a QR code that pairs a personal phone to a corporate workspace.
   */
  disableMobilePairing: boolean
  /**
   * Refuse the mobile *emulator*: streaming a local iOS Simulator or Android AVD into a
   * tab, its Settings pane, and the `orca emulator` CLI. Deliberately NOT the same switch
   * as `disableMobilePairing`, which is about a physical phone attaching to this desktop —
   * the two features share no code, and a fleet needs to express one without the other.
   */
  disableMobileEmulator: boolean
  /**
   * Refuse the third-party automation runners (`hermes`, `openclaw`): discovery, run
   * history, and the create/edit/pause/run paths that spawn the vendor CLI on a schedule.
   * `allowedAgents` covers the same providers when it is set, but it does not inherit
   * `lockdown` — and an unattended agent run with nobody at the keyboard is the last thing
   * a bare `"lockdown": true` should leave live.
   */
  disableExternalAutomations: boolean
  /**
   * Refuse Orca's OWN scheduler: when a stored automation's time comes, nothing is
   * dispatched and the run is recorded as `skipped_policy`. Bot routines ride the same
   * service, so one switch covers both.
   *
   * A different axis from `disableExternalAutomations`, which covers the third-party
   * runners (`hermes`, `openclaw`) and the vendor CLIs they spawn. That switch never
   * looked at the in-app timer at all, so a bare `"lockdown": true` still left Orca free
   * to start an agent with nobody at the keyboard — the exact thing its own comment says
   * should be the last lane left live.
   *
   * Deliberately scoped to the *unattended* trigger. A person pressing Run now is at the
   * keyboard and could have typed the same prompt into a terminal; refusing that would
   * remove a capability without removing a risk.
   */
  disableUnattendedAgentRuns: boolean
  /**
   * Stop suggesting that a user install an agent CLI themselves: the "Available to
   * install" section in Settings → Agents and the onboarding step's install banner.
   * A different axis from `allowedAgents` — that one says which agents may be selected,
   * this one says whether "go install it yourself" is sound advice. On a fleet where CLIs
   * arrive through corporate software distribution it is simply the wrong instruction.
   */
  disableAgentInstallSuggestions: boolean
  /**
   * Refuse to register a vendor AI account (Claude subscription, Codex, Grok, MiniMax).
   * Distinct from `allowedAgents`, which restricts which CLI a session may run: agents
   * and vendor credentials are different axes, and a Bedrock fleet needs `claude` the
   * binary while forbidding the platform.claude.com login that shares its name.
   * Listing, selecting, and removing already-stored accounts stay available — taking
   * away the only way to clear a credential would be worse than leaving it.
   */
  disableVendorProviderAccounts: boolean
  /**
   * Refuse to attach this desktop to another Orca instance (Settings → Runtime
   * Environments, pairing codes, and the hydration that would restore one at boot).
   * Scoped to the outbound direction; SSH hosts and the inbound `orca serve` listener
   * are separate lanes and are deliberately untouched.
   */
  disableRemoteOrcaServer: boolean
  /**
   * Turn off dictation end to end: the local STT runtime, its model downloads, the
   * composer's microphone, and the mobile client's remote dictation toggle.
   */
  disableVoice: boolean
  /**
   * Refuse the plugin system end to end. Unlike the other switches this one overrides a
   * *user* setting (`pluginSystemEnabled`), because that toggle is what upstream gates
   * the whole feature on — and it opens two egress lanes the allowlist cannot see: a
   * `git` subprocess clone of the vendor marketplace and a `fetch` of the vendor's
   * kill-list. Plugin workers are ordinary child processes with unrestricted network.
   */
  disablePlugins: boolean
  /**
   * Stop this build from sending users to the upstream vendor's own web properties:
   * the community/social channels (Discord, X), the public issue tracker on
   * github.com, and the vendor's docs/changelog on onorca.dev.
   *
   * Two different reasons, one rule. The community lane is where a user posts
   * corporate context into a public venue — a disclosure hazard, not an egress one,
   * since the link opens in the OS browser where a network allowlist can never see
   * it. The docs lane is simply wrong instruction on this fleet: upstream docs
   * describe Cloud sign-in, plugins, mobile pairing and auto-update, all of which
   * the policy has already turned off, and the changelog advertises releases the
   * fleet will not receive.
   *
   * Not a web filter, and not an allowlist. Typing x.com into the embedded browser
   * still works, the GHES host is never touched, and third-party tooling docs
   * (cli.github.com, git-scm.com, each agent CLI's own site) stay — those are
   * legitimate help for tools the fleet actually runs.
   */
  disableVendorLinks: boolean
  /**
   * Make Computer Use ask the person at the keyboard before it changes anything —
   * clicks, typing, scrolls, drags. Reads (accessibility tree, screenshots) still run
   * unprompted; the agent is otherwise free to drive any app on the machine, and
   * whatever is on screen lands in the model request.
   */
  requireComputerUseApproval: boolean
  /** Opt-in hard allowlist over renderer + main-process HTTP. Never inherited. */
  enforceNetworkAllowlist: boolean
  /** Hosts the allowlist permits, normalized. Always includes the GHES host. */
  allowedNetworkHosts: readonly string[]
  /** Private GitHub Enterprise host, e.g. "github.samsungds.net". */
  githubEnterpriseHost: string | null
  /**
   * `OWNER/REPO` on `githubEnterpriseHost` whose release tags say what the newest
   * build is. `null` means "use the build's own default" — this is not a switch, so
   * it does not inherit `lockdown`; `disableAutoUpdate` is what turns the lane off.
   *
   * A key rather than a source constant because the host beside it is already one:
   * a fleet that moves or renames the release repository would otherwise need a new
   * build to keep the check working.
   */
  updateReleaseRepository: string | null
  /**
   * Agent CLIs a user may select (by TuiAgent id, e.g. "claude"). `null` means no
   * restriction (upstream behavior); a list confines every picker to those ids so a
   * Bedrock-only fleet can hide OpenAI/Gemini/etc. The self-hosted models are not
   * agents — they ride the allowed agent's picker — so they need no entry here.
   */
  allowedAgents: readonly string[] | null
  /** Absolute path of the policy file in effect, or null when none was found. */
  sourcePath: string | null
  /** Admin-facing complaints about the document (unknown keys, wrong types). */
  warnings: readonly string[]
}

export type EnterprisePolicyDocument = Record<string, unknown>
export type PolicyEnv = Record<string, string | undefined>

// Switches that default to the master `lockdown` value when the key is absent.
// Setting one explicitly to `false` opts that single feature back in.
export const LOCKDOWN_INHERITING_KEYS = [
  'disableTelemetry',
  'disableAutoUpdate',
  'disableStarNag',
  'disableCloudRelay',
  'disableUsagePolling',
  'disableManagedClaudeAccounts',
  'disableSpellcheck',
  'disableMobilePairing',
  'disableMobileEmulator',
  'disableExternalAutomations',
  'disableUnattendedAgentRuns',
  'disableAgentInstallSuggestions',
  'disableVendorProviderAccounts',
  'disableRemoteOrcaServer',
  'disableVoice',
  'disablePlugins',
  'disableVendorLinks',
  'requireComputerUseApproval'
] as const

type LockdownInheritingKey = (typeof LOCKDOWN_INHERITING_KEYS)[number]

const KNOWN_KEYS: ReadonlySet<string> = new Set<string>([
  '$schema',
  'lockdown',
  'githubEnterpriseHost',
  'updateReleaseRepository',
  'allowedAgents',
  'allowedNetworkHosts',
  // Retired: the self-hosted model lane was removed. Still accepted so a deployed
  // policy file that still carries it does not start reporting an unknown key.
  'llmEndpoints',
  'enforceNetworkAllowlist',
  ...LOCKDOWN_INHERITING_KEYS
])

const TRUTHY: ReadonlySet<string> = new Set(['true', 'yes', 'on', '1'])
const FALSY: ReadonlySet<string> = new Set(['false', 'no', 'off', '0'])

function isPlainObject(value: unknown): value is EnterprisePolicyDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Returns undefined for an absent or unusable value so the caller falls back to
// the lockdown default via `??`. A blank or misspelled value must never read as
// "off" — that is how an admin typo silently unlocks a machine.
function readBoolean(
  document: EnterprisePolicyDocument,
  key: string,
  warnings: string[]
): boolean | undefined {
  const raw = document[key]
  if (raw === undefined) {
    return undefined
  }
  if (typeof raw === 'boolean') {
    return raw
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (TRUTHY.has(normalized)) {
      return true
    }
    if (FALSY.has(normalized)) {
      return false
    }
  }
  warnings.push(`"${key}" must be true or false; ignoring ${JSON.stringify(raw)}.`)
  return undefined
}

// Tolerates a full URL, a trailing slash/path, embedded credentials, and an
// explicit port so an admin can paste whatever they have in front of them.
export function normalizeHost(value: string | undefined | null): string | null {
  if (typeof value !== 'string') {
    return null
  }
  let host = value.trim().toLowerCase()
  if (!host) {
    return null
  }
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  host = host.split('/')[0] ?? host
  host = host.split('@').at(-1) ?? host
  host = host.split(':')[0] ?? host
  return host || null
}

function readHost(
  document: EnterprisePolicyDocument,
  key: string,
  warnings: string[]
): string | null {
  const raw = document[key]
  if (raw === undefined) {
    return null
  }
  if (typeof raw !== 'string') {
    warnings.push(`"${key}" must be a string hostname; ignoring ${JSON.stringify(raw)}.`)
    return null
  }
  const host = normalizeHost(raw)
  if (!host) {
    warnings.push(`"${key}" is blank; ignoring it.`)
  }
  return host
}

// `OWNER/REPO` only: never a URL and never a host, so a pasted release-page link
// cannot redirect the lookup off `githubEnterpriseHost`. An unusable value warns and
// returns null, which leaves the build's own default coordinate in force.
function readRepositoryCoordinate(
  document: EnterprisePolicyDocument,
  key: string,
  warnings: string[]
): string | null {
  const raw = document[key]
  if (raw === undefined) {
    return null
  }
  if (typeof raw !== 'string' || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(raw.trim())) {
    warnings.push(`"${key}" must be "OWNER/REPO"; ignoring ${JSON.stringify(raw)}.`)
    return null
  }
  return raw.trim()
}

// Returns null (no restriction) for an absent list, and — deliberately — also for
// an empty or all-invalid one: a list that hides every agent would leave the picker
// with nothing to select, so an admin typo must never brick the app that way.
function readAgentAllowlist(
  document: EnterprisePolicyDocument,
  key: string,
  warnings: string[]
): string[] | null {
  const raw = document[key]
  if (raw === undefined) {
    return null
  }
  if (!Array.isArray(raw)) {
    warnings.push(`"${key}" must be an array of agent ids; ignoring it.`)
    return null
  }
  const agents: string[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const id = typeof entry === 'string' ? entry.trim() : ''
    if (!id) {
      warnings.push(`"${key}" entry ${JSON.stringify(entry)} is not an agent id; ignoring it.`)
      continue
    }
    if (!seen.has(id)) {
      seen.add(id)
      agents.push(id)
    }
  }
  if (agents.length === 0) {
    warnings.push(`"${key}" listed no usable agent id; ignoring it.`)
    return null
  }
  return agents
}

function readHostList(
  document: EnterprisePolicyDocument,
  key: string,
  warnings: string[]
): string[] {
  const raw = document[key]
  if (raw === undefined) {
    return []
  }
  if (!Array.isArray(raw)) {
    warnings.push(`"${key}" must be an array of hostnames; ignoring ${JSON.stringify(raw)}.`)
    return []
  }
  const hosts: string[] = []
  for (const entry of raw) {
    const host = normalizeHost(typeof entry === 'string' ? entry : null)
    if (host) {
      hosts.push(host)
    } else {
      warnings.push(`"${key}" entry ${JSON.stringify(entry)} is not a hostname; ignoring it.`)
    }
  }
  return hosts
}

/**
 * Resolve the effective policy from an already-parsed document.
 *
 * `env` is consulted for exactly one thing: `GH_HOST`, which is the `gh` CLI's
 * own variable and is therefore already present on these machines — the fork
 * does not invent it. Pass `null` for the document when no policy file exists.
 *
 * `ghConfigHost` reads the host gh's own config file names (see
 * src/main/github/gh-config-host.ts). It is the last-resort fallback for
 * `githubEnterpriseHost`, because `gh auth login --hostname <ghes>` is how these
 * machines are actually pointed at the company host, and reading only `GH_HOST`
 * meant that never reached the Gitea mis-fallback guard or the network allowlist.
 * A thunk, not a value: it touches the filesystem, so the two sources above it
 * must be able to short-circuit it away.
 */
export function resolveEnterprisePolicy(
  document: unknown = null,
  env: PolicyEnv = {},
  sourcePath: string | null = null,
  ghConfigHost: () => string | null = () => null
): EnterprisePolicy {
  const warnings: string[] = []
  let effective: EnterprisePolicyDocument = {}
  if (isPlainObject(document)) {
    effective = document
  } else if (document !== null && document !== undefined) {
    warnings.push('Policy file must contain a JSON object; ignoring its contents.')
  }

  for (const key of Object.keys(effective)) {
    if (!KNOWN_KEYS.has(key)) {
      warnings.push(`Unknown policy key "${key}" ignored.`)
    }
  }

  const lockdown = readBoolean(effective, 'lockdown', warnings) ?? false
  const switches = {} as Record<LockdownInheritingKey, boolean>
  for (const key of LOCKDOWN_INHERITING_KEYS) {
    switches[key] = readBoolean(effective, key, warnings) ?? lockdown
  }

  const githubEnterpriseHost =
    readHost(effective, 'githubEnterpriseHost', warnings) ??
    normalizeHost(env.GH_HOST) ??
    normalizeHost(ghConfigHost())
  const allowedAgents = readAgentAllowlist(effective, 'allowedAgents', warnings)
  const allowed = new Set(readHostList(effective, 'allowedNetworkHosts', warnings))
  if (githubEnterpriseHost) {
    allowed.add(githubEnterpriseHost)
  }
  return {
    lockdown,
    ...switches,
    // Not lockdown-inherited: a hard allowlist can break a deployment in ways the
    // feature switches cannot, so it stays opt-in even under the master switch.
    enforceNetworkAllowlist: readBoolean(effective, 'enforceNetworkAllowlist', warnings) ?? false,
    allowedNetworkHosts: [...allowed],
    githubEnterpriseHost,
    updateReleaseRepository: readRepositoryCoordinate(
      effective,
      'updateReleaseRepository',
      warnings
    ),
    allowedAgents,
    sourcePath,
    warnings
  }
}

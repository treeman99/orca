// Shared types for the corporate GitHub Enterprise (GHES) host + browser login the
// Settings UI drives. gh owns the credential (its keyring); the app only sets the
// host, kicks off `gh auth login --web`, and reports status back.

export type GithubEnterpriseAuthStatus = {
  /** False when the gh CLI is not installed / not on PATH. */
  ghAvailable: boolean
  /**
   * The GHES host in effect: user-set, else the corporate policy host, else the one host
   * `gh` is already logged in to — that last fallback is what lets a machine configured
   * only through `gh auth login --hostname` report the company host instead of nothing.
   */
  host: string | null
  /** Whether gh has an account for `host`. */
  authenticated: boolean
  /** The logged-in username for `host`, when gh reports one. */
  account: string | null
  /**
   * The host `gh` actually targets when a workspace has no remote of its own, and where
   * that value came from. Distinct from `host`: the policy's `githubEnterpriseHost` does
   * not redirect gh, and `GH_HOST` outranks both.
   */
  effectiveHost: string
  effectiveHostSource: EffectiveGitHubHostSource
}

export type EffectiveGitHubHostSource =
  | 'repository-remote'
  | 'gh-host-env'
  | 'gh-config-host'
  | 'user-setting'
  | 'enterprise-policy'
  | 'default'

/** Live progress emitted while `gh auth login --web` runs. */
export type GithubEnterpriseLoginProgress = {
  /** The one-time code the user types into the browser, once gh prints it. */
  oneTimeCode: string | null
  /** The device-verification URL to open in the browser. */
  verificationUrl: string | null
}

export type GithubEnterpriseLoginResult =
  | { ok: true; account: string | null }
  | {
      ok: false
      reason: 'no-host' | 'gh-unavailable' | 'timeout' | 'failed' | 'cancelled'
      message?: string
    }

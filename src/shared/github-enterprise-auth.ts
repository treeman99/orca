// Shared types for the corporate GitHub Enterprise (GHES) host + browser login the
// Settings UI drives. gh owns the credential (its keyring); the app only sets the
// host, kicks off `gh auth login --web`, and reports status back.

export type GithubEnterpriseAuthStatus = {
  /** False when the gh CLI is not installed / not on PATH. */
  ghAvailable: boolean
  /** The GHES host in effect (user-set, else the corporate policy host), or null. */
  host: string | null
  /** Whether gh has an account for `host`. */
  authenticated: boolean
  /** The logged-in username for `host`, when gh reports one. */
  account: string | null
}

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

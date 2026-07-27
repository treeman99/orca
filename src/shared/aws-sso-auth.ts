// Shared types for the AWS SSO sign-in the Settings UI drives.
//
// The AWS CLI owns the credential: `aws sso login` writes an access token into its
// own cache (~/.aws/sso/cache) and Claude Code CLI picks it up through the standard
// credential chain. Orca stores nothing here — it picks a profile, runs the CLI, and
// reports the cached token's expiry back so the user can see whether they are signed in.

/** An SSO-capable profile resolved from the AWS config file. */
export type AwsSsoProfile = {
  /** Profile name as `--profile` expects it (`default`, or the name after `profile `). */
  name: string
  /** The IdP portal URL, from the profile or its `sso-session` block. */
  startUrl: string
  /** Region that serves the SSO/OIDC endpoints, when the config names one. */
  ssoRegion: string | null
  /** `sso_account_id`, for showing which account the profile assumes. */
  accountId: string | null
  /** `sso_role_name`, same purpose. */
  roleName: string | null
  /** The `sso-session` block this profile inherits from, when it uses one. */
  sessionName: string | null
}

export type AwsSsoProfileStatus = AwsSsoProfile & {
  /** ISO expiry of the cached token for this profile's start URL, or null when none. */
  expiresAt: string | null
  /** True when a cached token exists and has not expired yet. */
  active: boolean
}

export type AwsSsoStatus = {
  /** False when the AWS CLI is not installed / not on PATH. */
  awsAvailable: boolean
  /** The config file that was read, so a user can tell which file the list came from. */
  configPath: string | null
  /** SSO-capable profiles, in config-file order. */
  profiles: AwsSsoProfileStatus[]
  /** The profile the UI should preselect: the user's saved choice, else a sensible one. */
  selectedProfile: string | null
}

/** Live progress emitted while `aws sso login` runs. */
export type AwsSsoLoginProgress = {
  /** The device code to type in the browser. Only the device flow prints one. */
  userCode: string | null
  /** The authorization URL the CLI printed, for when the browser did not open. */
  verificationUrl: string | null
  /** Whether this run forced the device-code flow (`--use-device-code`). */
  usingDeviceCode: boolean
}

export type AwsSsoLoginResult =
  | { ok: true; profile: string }
  | {
      ok: false
      reason: 'no-profile' | 'aws-unavailable' | 'timeout' | 'failed' | 'cancelled'
      message?: string
    }

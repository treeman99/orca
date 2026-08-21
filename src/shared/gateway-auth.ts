// Shared types for the corporate gateway sign-in the Settings UI drives.
//
// The gateway CLI owns the credential: `gateway-cli login` completes an OIDC browser
// round trip and provisions a virtual key on its own. Orca stores nothing here and
// injects no environment variable — it runs the CLI, streams what it prints, and asks
// `gateway-cli verify` whether a usable session exists. This replaced the AWS SSO lane,
// where each machine had to manage an AWS profile and its own credential chain.

/** The CLI this lane drives. Not configurable — resolved from PATH. */
export const GATEWAY_CLI_BINARY = 'gateway-cli'

/**
 * Which signal decided `signedIn`. `none` means verify gave nothing to go on, so the UI
 * must not state a session verdict as fact. Optional on the wire: an older main process
 * simply omits it.
 */
export type GatewaySignedInEvidence = 'json' | 'text' | 'exit-code' | 'none'

export type GatewayStatus = {
  /** False when the gateway CLI is not installed / not on PATH. */
  gatewayAvailable: boolean
  /** Version the CLI reported, when it prints a recognizable one. */
  version: string | null
  /** True when `gateway-cli verify` reports a usable session. */
  signedIn: boolean
  /** What `signedIn` rests on, so the UI can stay vague when nothing was parsed. */
  evidence?: GatewaySignedInEvidence
  /** ISO expiry when verify reported one. Null means "verify did not say". */
  expiresAt: string | null
  /** Identity/account label verify reported, so the user can see who is signed in. */
  identity: string | null
  /** One-line summary from verify, shown when nothing more specific parsed. */
  detail: string | null
}

/** Live progress emitted while `gateway-cli login` runs. */
export type GatewayLoginProgress = {
  /** The code to confirm in the browser, when this flow prints one. */
  userCode: string | null
  /** The authorization URL the CLI printed, for when the browser did not open. */
  verificationUrl: string | null
}

export type GatewayLoginResult =
  | { ok: true }
  | {
      ok: false
      reason: 'gateway-unavailable' | 'pty-unavailable' | 'timeout' | 'failed' | 'cancelled'
      message?: string
    }

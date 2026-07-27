// Drives `aws sso login --profile <name>` in a PTY so a user can complete the browser
// authorization from Settings.
//
// The CLI opens the browser itself (its cross-platform default) and polls until the
// user authorizes. We surface whatever it prints — the authorization URL, and the
// device code when that flow is in play — and resolve when the process exits. The
// credential lands in the CLI's own token cache; the app stores nothing here.

import type * as NodePty from 'node-pty'
import {
  outputReportsSsoLoginComplete,
  parseAwsCliErrorMessage,
  parseAwsSsoUserCode,
  parseAwsSsoVerificationUrl
} from '../../shared/aws-sso-cli-output'
import type { AwsSsoLoginProgress, AwsSsoLoginResult } from '../../shared/aws-sso-auth'

// The user has to switch to a browser and authorize, so allow a generous window.
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
// Why a very wide terminal: the PKCE authorization URL is long, and a narrow PTY
// invites the CLI to wrap it — a wrapped URL is useless to the user and to the parser.
const PTY_COLUMNS = 400

export type AwsSsoLoginDeps = {
  onProgress: (progress: AwsSsoLoginProgress) => void
  signal?: AbortSignal
}

export type AwsSsoLoginOptions = {
  /**
   * Force the device-code flow. Worth exposing because the CLI's default (since v2.22)
   * is an authorization-code flow that needs a loopback listener the browser can reach
   * — which is exactly what a locked-down corporate desktop tends to break.
   */
  useDeviceCode: boolean
}

export async function runAwsSsoLogin(
  profile: string,
  options: AwsSsoLoginOptions,
  deps: AwsSsoLoginDeps
): Promise<AwsSsoLoginResult> {
  let pty: typeof NodePty
  try {
    pty = await import('node-pty')
  } catch {
    return { ok: false, reason: 'aws-unavailable', message: 'PTY runtime unavailable' }
  }

  const args = ['sso', 'login', '--profile', profile]
  if (options.useDeviceCode) {
    args.push('--use-device-code')
  }

  return new Promise<AwsSsoLoginResult>((resolve) => {
    let output = ''
    let settled = false
    let lastCode: string | null = null
    let lastUrl: string | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    let term: NodePty.IPty
    try {
      term = pty.spawn('aws', args, {
        name: 'xterm-256color',
        cols: PTY_COLUMNS,
        rows: 40,
        // Why AWS_PAGER='': the CLI pipes output through a pager when one is
        // configured, which would hold the URL and the code hostage.
        env: { ...process.env, TERM: 'xterm-256color', AWS_PAGER: '' }
      })
    } catch (error) {
      // node-pty throws synchronously when the binary is missing.
      const message = error instanceof Error ? error.message : String(error)
      return resolve({ ok: false, reason: 'aws-unavailable', message })
    }

    const finish = (result: AwsSsoLoginResult): void => {
      if (settled) {
        return
      }
      settled = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      deps.signal?.removeEventListener('abort', onAbort)
      try {
        term.kill()
      } catch {
        // Already exited.
      }
      resolve(result)
    }

    function onAbort(): void {
      finish({ ok: false, reason: 'cancelled' })
    }

    if (deps.signal) {
      if (deps.signal.aborted) {
        finish({ ok: false, reason: 'cancelled' })
        return
      }
      deps.signal.addEventListener('abort', onAbort, { once: true })
    }

    timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), LOGIN_TIMEOUT_MS)

    term.onData((chunk) => {
      output += chunk
      const userCode = parseAwsSsoUserCode(output)
      const verificationUrl = parseAwsSsoVerificationUrl(output)
      if (userCode !== lastCode || verificationUrl !== lastUrl) {
        lastCode = userCode
        lastUrl = verificationUrl
        deps.onProgress({ userCode, verificationUrl, usingDeviceCode: options.useDeviceCode })
      }
    })

    term.onExit(({ exitCode }) => {
      if (exitCode === 0 && outputReportsSsoLoginComplete(output)) {
        finish({ ok: true, profile })
        return
      }
      finish({
        ok: false,
        reason: 'failed',
        message: parseAwsCliErrorMessage(output) ?? `aws sso login exited with code ${exitCode}`
      })
    })
  })
}

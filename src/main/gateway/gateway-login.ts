// Drives `gateway-cli login` in a PTY so a user can complete the OIDC browser round
// trip from Settings.
//
// The CLI opens the browser itself and provisions the virtual key on its own. We surface
// whatever it prints — the authorization URL, and a confirmation code when one appears —
// and resolve when the process exits. Orca stores nothing and injects nothing.

import type * as NodePty from 'node-pty'
import {
  parseGatewayCliErrorMessage,
  parseGatewayUserCode,
  parseGatewayVerificationUrl
} from '../../shared/gateway-cli-output'
import type { GatewayLoginProgress, GatewayLoginResult } from '../../shared/gateway-auth'
import { getSpawnArgsForWindows } from '../win32-utils'
import { buildGatewayCommandEnv, resolveGatewayCommand } from './gateway-cli-command'

// The user has to switch to a browser and authorize, so allow a generous window.
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
// Why a very wide terminal: the PKCE authorization URL is long, and a narrow PTY invites
// the CLI to wrap it — a wrapped URL is useless to the user and to the parser.
const PTY_COLUMNS = 400

export type GatewayLoginDeps = {
  onProgress: (progress: GatewayLoginProgress) => void
  signal?: AbortSignal
}

export async function runGatewayLogin(deps: GatewayLoginDeps): Promise<GatewayLoginResult> {
  let pty: typeof NodePty
  try {
    pty = await import('node-pty')
  } catch {
    // Distinct from 'gateway-unavailable': collapsing the two made a broken native module
    // read as a missing CLI, which sent users looking in entirely the wrong place.
    return { ok: false, reason: 'pty-unavailable', message: 'PTY runtime unavailable' }
  }

  const env = buildGatewayCommandEnv(process.env)
  // `login` takes no arguments: the CLI resolves the tenant and provisions the key itself.
  const resolved = getSpawnArgsForWindows(resolveGatewayCommand(env), ['login'])

  return new Promise<GatewayLoginResult>((resolve) => {
    let output = ''
    let settled = false
    let lastCode: string | null = null
    let lastUrl: string | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    let term: NodePty.IPty
    try {
      term = pty.spawn(resolved.spawnCmd, resolved.spawnArgs, {
        name: 'xterm-256color',
        cols: PTY_COLUMNS,
        rows: 40,
        env: { ...env, TERM: 'xterm-256color' }
      })
    } catch (error) {
      // node-pty throws synchronously when the binary is missing.
      const message = error instanceof Error ? error.message : String(error)
      return resolve({ ok: false, reason: 'gateway-unavailable', message })
    }

    const finish = (result: GatewayLoginResult): void => {
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
      const userCode = parseGatewayUserCode(output)
      const verificationUrl = parseGatewayVerificationUrl(output)
      if (userCode !== lastCode || verificationUrl !== lastUrl) {
        lastCode = userCode
        lastUrl = verificationUrl
        deps.onProgress({ userCode, verificationUrl })
      }
    })

    term.onExit(({ exitCode }) => {
      // Unlike the AWS lane, no completion phrase is matched: gateway-cli's success
      // wording is unknown, and inventing one would fail a sign-in that actually worked.
      if (exitCode === 0) {
        finish({ ok: true })
        return
      }
      finish({
        ok: false,
        reason: 'failed',
        message:
          parseGatewayCliErrorMessage(output) ?? `gateway-cli login exited with code ${exitCode}`
      })
    })
  })
}

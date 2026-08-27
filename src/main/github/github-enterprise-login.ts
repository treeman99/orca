// Drives `gh auth login --hostname <host> --git-protocol https --web` in a PTY so a
// user can complete the browser (device) flow from Settings. gh prints a one-time
// code, waits on Enter, then opens the browser and polls until the user authorizes.
//
// We surface the code via onProgress, auto-answer the Enter prompt so gh starts
// polling, and let gh open the browser itself (its cross-platform default). The
// credential lands in gh's own keyring — the app stores nothing here.

import { runProcess } from '../../shared/child-process/run-process'
import type * as NodePty from 'node-pty'
import type {
  GithubEnterpriseLoginProgress,
  GithubEnterpriseLoginResult
} from '../../shared/github-enterprise-auth'
import {
  ghDeviceVerificationUrl,
  outputAwaitsBrowserEnter,
  outputReportsLoginComplete,
  parseGhLoggedInAccount,
  parseGhOneTimeCode
} from '../../shared/github-enterprise-device-login'

// The user has to switch to a browser and authorize, so allow a generous window.
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000

export type GithubEnterpriseLoginDeps = {
  onProgress: (progress: GithubEnterpriseLoginProgress) => void
  signal?: AbortSignal
}

export async function runGithubEnterpriseDeviceLogin(
  host: string,
  deps: GithubEnterpriseLoginDeps
): Promise<GithubEnterpriseLoginResult> {
  const verificationUrl = ghDeviceVerificationUrl(host)
  let pty: typeof NodePty
  try {
    pty = await import('node-pty')
  } catch {
    return { ok: false, reason: 'gh-unavailable', message: 'PTY runtime unavailable' }
  }

  return new Promise<GithubEnterpriseLoginResult>((resolve) => {
    let output = ''
    let settled = false
    let enterSent = false
    let lastCode: string | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    let term: NodePty.IPty
    try {
      term = pty.spawn(
        'gh',
        ['auth', 'login', '--hostname', host, '--git-protocol', 'https', '--web'],
        {
          name: 'xterm-256color',
          cols: 120,
          rows: 40,
          // Why: inherit the full env so gh resolves the same keyring/PATH as every
          // other gh call in the app; GH_PROMPT stays enabled — the device flow needs it.
          env: { ...process.env, TERM: 'xterm-256color', GH_NO_UPDATE_NOTIFIER: '1' }
        }
      )
    } catch (error) {
      // node-pty throws synchronously when the binary is missing.
      const message = error instanceof Error ? error.message : String(error)
      return resolve({ ok: false, reason: 'gh-unavailable', message })
    }

    const finish = (result: GithubEnterpriseLoginResult): void => {
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
      const code = parseGhOneTimeCode(output)
      if (code && code !== lastCode) {
        lastCode = code
        deps.onProgress({ oneTimeCode: code, verificationUrl })
      }
      // Answer the "Press Enter to open ... in your browser" prompt so gh opens the
      // browser and begins polling. Only once — the prompt appears a single time.
      if (!enterSent && outputAwaitsBrowserEnter(output)) {
        enterSent = true
        try {
          term.write('\r')
        } catch {
          // The process may have exited between the match and the write.
        }
      }
    })

    term.onExit(({ exitCode }) => {
      const account = parseGhLoggedInAccount(output)
      if (exitCode === 0 && (outputReportsLoginComplete(output) || account)) {
        finish({ ok: true, account })
        return
      }
      finish({
        ok: false,
        reason: 'failed',
        message: `gh auth login exited with code ${exitCode}`
      })
    })
  })
}

// Non-interactive login with a personal access token, for networks where the
// browser (device) flow is blocked. `gh auth login --with-token` reads the token
// from stdin and exits; the token lands in gh's keyring, never on our disk.
export async function runGithubEnterpriseTokenLogin(
  host: string,
  token: string
): Promise<GithubEnterpriseLoginResult> {
  if (!token.trim()) {
    return { ok: false, reason: 'failed', message: 'Empty token' }
  }
  // Why runProcess and not a bare spawn: it is the chokepoint that pins windowsHide and
  // Windows argv quoting (src/shared/child-process). It also writes stdin and closes it,
  // which is exactly how `--with-token` reads the token.
  try {
    const result = await runProcess({
      program: 'gh',
      args: ['auth', 'login', '--hostname', host, '--git-protocol', 'https', '--with-token'],
      env: { ...process.env, GH_NO_UPDATE_NOTIFIER: '1' },
      input: `${token.trim()}\n`
    })
    if (result.code === 0) {
      return { ok: true, account: null }
    }
    return {
      ok: false,
      reason: 'failed',
      message:
        result.stderr.trim() ||
        (result.timedOut ? 'gh auth login timed out' : `gh exited with code ${result.code}`)
    }
  } catch (error) {
    // runProcess rejects on the spawn error itself — ENOENT here means gh is missing.
    return {
      ok: false,
      reason: 'gh-unavailable',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

// IPC surface for the corporate GitHub Enterprise host + browser login the Settings
// UI drives. Five channels:
//
//   githubEnterprise:getStatus — the effective host and whether gh is logged into it.
//   githubEnterprise:setHost   — persist the user's GHES host (blank clears it).
//   githubEnterprise:login     — run `gh auth login --web`, streaming the one-time code
//                                back on githubEnterprise:loginProgress; resolves on exit.
//   githubEnterprise:logout    — `gh auth logout --hostname <host>`.
//
// gh owns the credential in its keyring; nothing here stores a token. The host is the
// user's saved host, else the corporate policy host, else the single host gh is already
// logged in to — reading gh's own state is what makes a `gh auth login --hostname <ghes>`
// run after installation visible here at all.

import { ipcMain, type WebContents } from 'electron'
import { normalizeHost } from '../../shared/enterprise-policy'
import type {
  GithubEnterpriseAuthStatus,
  GithubEnterpriseLoginResult
} from '../../shared/github-enterprise-auth'
import { diagnoseGhAuth } from '../github/auth-diagnose'
import { ghExecFileAsync } from '../github/gh-utils'
import {
  readStoredGithubEnterpriseHost,
  writeStoredGithubEnterpriseHost
} from '../github/github-enterprise-host-store'
import {
  runGithubEnterpriseDeviceLogin,
  runGithubEnterpriseTokenLogin
} from '../github/github-enterprise-login'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'
import {
  ghConfiguredDefaultHost,
  resolveEffectiveGitHubHost
} from '../github/effective-github-host'

// A GitHub PAT is a paste, not a document; anything longer is a mistake or an abuse
// of the IPC surface.
const MAX_TOKEN_LENGTH = 8192

type GhAuthProbe = {
  ghAvailable: boolean
  /** Every host gh reports a login for, with the account name it shows. */
  accounts: readonly { host: string; user: string | null }[]
}

type Dependencies = {
  policyHost: () => string | null
  storedHost: () => string | null
  ghHostEnv: () => string | null
  saveHost: (host: string | null) => void
  /** Host-less on purpose: the host we should report is partly derived from the answer. */
  diagnose: () => Promise<GhAuthProbe>
  login: typeof runGithubEnterpriseDeviceLogin
  loginWithToken: typeof runGithubEnterpriseTokenLogin
  logout: (host: string) => Promise<void>
}

// Only one browser login can be in flight; a new one aborts the previous.
let activeLogin: AbortController | null = null

function defaultDependencies(): Dependencies {
  return {
    policyHost: () => getEnterprisePolicy().githubEnterpriseHost,
    storedHost: readStoredGithubEnterpriseHost,
    ghHostEnv: () => process.env.GH_HOST ?? null,
    saveHost: writeStoredGithubEnterpriseHost,
    diagnose: async () => {
      const result = await diagnoseGhAuth()
      return {
        ghAvailable: result.ghAvailable,
        accounts: result.accounts.map((entry) => ({ host: entry.host, user: entry.user }))
      }
    },
    login: runGithubEnterpriseDeviceLogin,
    loginWithToken: runGithubEnterpriseTokenLogin,
    logout: async (host) => {
      await ghExecFileAsync(['auth', 'logout', '--hostname', host], { host })
    }
  }
}

/** The host a sign-in/sign-out targets: what Orca was told, never what gh inferred. */
function configuredHost(dependencies: Dependencies): string | null {
  return dependencies.storedHost() ?? dependencies.policyHost()
}

function readHostArg(raw: unknown): string | null {
  const args = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
  return normalizeHost(typeof args?.host === 'string' ? args.host : null)
}

function readTokenArg(raw: unknown): string {
  const args = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
  const token = typeof args?.token === 'string' ? args.token : ''
  if (token.length > MAX_TOKEN_LENGTH) {
    throw new Error('token is too long')
  }
  return token
}

async function getStatus(dependencies: Dependencies): Promise<GithubEnterpriseAuthStatus> {
  const probe = await dependencies.diagnose()
  const ghConfigHost = ghConfiguredDefaultHost(probe.accounts)
  // What gh will actually target — not the same value as the login host, and the
  // difference is exactly what a user reading this pane needs to see.
  const effective = resolveEffectiveGitHubHost({
    ghHostEnv: dependencies.ghHostEnv(),
    ghConfigHost,
    storedHost: dependencies.storedHost(),
    policyHost: dependencies.policyHost()
  })
  // Why gh's own host is a fallback here too: on a machine where only
  // `gh auth login --hostname <ghes>` ran, the company host *is* configured — just not
  // by us — and reporting "none" sent people to re-enter it or reinstall the app.
  const host = configuredHost(dependencies) ?? ghConfigHost
  const account = host
    ? (probe.accounts.find((entry) => normalizeHost(entry.host) === host) ?? null)
    : null
  return {
    ghAvailable: probe.ghAvailable,
    host,
    authenticated: account !== null,
    account: account?.user ?? null,
    effectiveHost: effective.host,
    effectiveHostSource: effective.source
  }
}

async function login(
  sender: WebContents,
  raw: unknown,
  dependencies: Dependencies
): Promise<GithubEnterpriseLoginResult> {
  // A host passed with the request (the field the user just typed) wins, so login
  // works before setHost round-trips; fall back to the effective host otherwise.
  const host = readHostArg(raw) ?? configuredHost(dependencies)
  if (!host) {
    return { ok: false, reason: 'no-host' }
  }

  activeLogin?.abort()
  const controller = new AbortController()
  activeLogin = controller

  const result = await dependencies.login(host, {
    signal: controller.signal,
    onProgress: (progress) => {
      if (!sender.isDestroyed()) {
        sender.send('githubEnterprise:loginProgress', progress)
      }
    }
  })

  if (activeLogin === controller) {
    activeLogin = null
  }
  // Remember the host that just authenticated so the field prefills next time.
  if (result.ok) {
    dependencies.saveHost(host)
  }
  return result
}

async function loginWithToken(
  raw: unknown,
  dependencies: Dependencies
): Promise<GithubEnterpriseLoginResult> {
  const host = readHostArg(raw) ?? configuredHost(dependencies)
  if (!host) {
    return { ok: false, reason: 'no-host' }
  }
  const result = await dependencies.loginWithToken(host, readTokenArg(raw))
  if (result.ok) {
    dependencies.saveHost(host)
  }
  return result
}

export function registerGithubEnterpriseHandlers(
  dependencies: Dependencies = defaultDependencies()
): void {
  ipcMain.handle(
    'githubEnterprise:getStatus',
    (): Promise<GithubEnterpriseAuthStatus> => getStatus(dependencies)
  )

  // Re-reads gh rather than returning a stub: the host the user just typed may already
  // be signed in, and claiming otherwise is what made this pane look stuck.
  ipcMain.handle(
    'githubEnterprise:setHost',
    (_event, raw: unknown): Promise<GithubEnterpriseAuthStatus> => {
      dependencies.saveHost(readHostArg(raw))
      return getStatus(dependencies)
    }
  )

  ipcMain.handle(
    'githubEnterprise:login',
    (event, raw: unknown): Promise<GithubEnterpriseLoginResult> =>
      login(event.sender, raw, dependencies)
  )

  ipcMain.handle(
    'githubEnterprise:loginWithToken',
    (_event, raw: unknown): Promise<GithubEnterpriseLoginResult> =>
      loginWithToken(raw, dependencies)
  )

  ipcMain.handle('githubEnterprise:logout', async (_event, raw: unknown): Promise<void> => {
    const host = readHostArg(raw) ?? configuredHost(dependencies)
    if (host) {
      await dependencies.logout(host)
    }
  })
}

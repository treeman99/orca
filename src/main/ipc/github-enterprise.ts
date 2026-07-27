// IPC surface for the corporate GitHub Enterprise host + browser login the Settings
// UI drives. Five channels:
//
//   githubEnterprise:getStatus — the effective host and whether gh is logged into it.
//   githubEnterprise:setHost   — persist the user's GHES host (blank clears it).
//   githubEnterprise:login     — run `gh auth login --web`, streaming the one-time code
//                                back on githubEnterprise:loginProgress; resolves on exit.
//   githubEnterprise:logout    — `gh auth logout --hostname <host>`.
//
// gh owns the credential in its keyring; nothing here stores a token. The effective
// host is the user's saved host, else the corporate policy host.

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

// A GitHub PAT is a paste, not a document; anything longer is a mistake or an abuse
// of the IPC surface.
const MAX_TOKEN_LENGTH = 8192

type Dependencies = {
  policyHost: () => string | null
  storedHost: () => string | null
  saveHost: (host: string | null) => void
  diagnose: (host: string) => Promise<{
    ghAvailable: boolean
    authenticated: boolean
    account: string | null
  }>
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
    saveHost: writeStoredGithubEnterpriseHost,
    diagnose: async (host) => {
      const result = await diagnoseGhAuth(host)
      const account = result.accounts.find((entry) => entry.host === host)?.user ?? null
      return {
        ghAvailable: result.ghAvailable,
        authenticated: result.requiredHostAuthenticated === true,
        account
      }
    },
    login: runGithubEnterpriseDeviceLogin,
    loginWithToken: runGithubEnterpriseTokenLogin,
    logout: async (host) => {
      await ghExecFileAsync(['auth', 'logout', '--hostname', host], { host })
    }
  }
}

function effectiveHost(dependencies: Dependencies): string | null {
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
  const host = effectiveHost(dependencies)
  if (!host) {
    return { ghAvailable: true, host: null, authenticated: false, account: null }
  }
  const { ghAvailable, authenticated, account } = await dependencies.diagnose(host)
  return { ghAvailable, host, authenticated, account }
}

async function login(
  sender: WebContents,
  raw: unknown,
  dependencies: Dependencies
): Promise<GithubEnterpriseLoginResult> {
  // A host passed with the request (the field the user just typed) wins, so login
  // works before setHost round-trips; fall back to the effective host otherwise.
  const host = readHostArg(raw) ?? effectiveHost(dependencies)
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
  const host = readHostArg(raw) ?? effectiveHost(dependencies)
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

  ipcMain.handle('githubEnterprise:setHost', (_event, raw: unknown): GithubEnterpriseAuthStatus => {
    dependencies.saveHost(readHostArg(raw))
    return {
      ghAvailable: true,
      host: effectiveHost(dependencies),
      authenticated: false,
      account: null
    }
  })

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
    const host = readHostArg(raw) ?? effectiveHost(dependencies)
    if (host) {
      await dependencies.logout(host)
    }
  })
}

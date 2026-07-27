// IPC surface for the AWS SSO sign-in the Settings UI drives. Four channels:
//
//   awsSso:getStatus   — SSO profiles from the AWS config file, each with the expiry of
//                        its cached token, plus whether the AWS CLI is on PATH.
//   awsSso:setProfile  — remember which profile the picker shows.
//   awsSso:login       — run `aws sso login --profile <name>`, streaming the device code
//                        and authorization URL on awsSso:loginProgress; resolves on exit.
//   awsSso:logout      — `aws sso logout --profile <name>`, clearing the cached token.
//
// The AWS CLI owns the credential; nothing here reads or stores a token. A requested
// profile is matched against the config file before it reaches the CLI, so the renderer
// cannot hand an arbitrary string to a spawned process.

import { execFile } from 'node:child_process'
import { ipcMain, type WebContents } from 'electron'
import type {
  AwsSsoLoginResult,
  AwsSsoProfile,
  AwsSsoProfileStatus,
  AwsSsoStatus
} from '../../shared/aws-sso-auth'
import { detectAwsCli } from '../aws/aws-cli-availability'
import { readAwsSsoProfiles } from '../aws/aws-sso-config-file'
import { runAwsSsoLogin } from '../aws/aws-sso-login'
import {
  normalizeAwsProfileName,
  readStoredAwsSsoProfile,
  writeStoredAwsSsoProfile
} from '../aws/aws-sso-profile-store'
import { isAwsSsoTokenActive, readAwsSsoTokenExpiries } from '../aws/aws-sso-token-cache'

const LOGOUT_TIMEOUT_MS = 30_000

export type AwsSsoDependencies = {
  awsAvailable: () => Promise<boolean>
  readProfiles: () => { configPath: string | null; profiles: AwsSsoProfile[] }
  readTokenExpiries: () => Map<string, string>
  storedProfile: () => string | null
  saveProfile: (profile: string | null) => void
  login: typeof runAwsSsoLogin
  logout: (profile: string) => Promise<void>
  now: () => Date
}

// Only one sign-in can be in flight; a new one aborts the previous.
let activeLogin: AbortController | null = null

function defaultDependencies(): AwsSsoDependencies {
  return {
    awsAvailable: async () => (await detectAwsCli()).available,
    readProfiles: () => readAwsSsoProfiles(),
    readTokenExpiries: readAwsSsoTokenExpiries,
    storedProfile: readStoredAwsSsoProfile,
    saveProfile: writeStoredAwsSsoProfile,
    login: runAwsSsoLogin,
    logout: (profile) =>
      new Promise<void>((resolve, reject) => {
        execFile(
          'aws',
          ['sso', 'logout', '--profile', profile],
          { timeout: LOGOUT_TIMEOUT_MS, windowsHide: true },
          (error) => (error ? reject(error) : resolve())
        )
      }),
    now: () => new Date()
  }
}

function describeProfiles(
  dependencies: AwsSsoDependencies,
  profiles: AwsSsoProfile[]
): AwsSsoProfileStatus[] {
  const expiries = dependencies.readTokenExpiries()
  const now = dependencies.now()
  return profiles.map((profile) => {
    const expiresAt = expiries.get(profile.startUrl) ?? null
    return { ...profile, expiresAt, active: isAwsSsoTokenActive(expiresAt, now) }
  })
}

/**
 * The profile the picker should show: the user's saved choice when it still exists,
 * else a signed-in one (the likely intent), else the first profile in the file.
 */
function selectProfile(stored: string | null, profiles: AwsSsoProfileStatus[]): string | null {
  const savedMatch = profiles.find((profile) => profile.name === stored)
  const active = profiles.find((profile) => profile.active)
  return savedMatch?.name ?? active?.name ?? profiles[0]?.name ?? null
}

async function getStatus(dependencies: AwsSsoDependencies): Promise<AwsSsoStatus> {
  const { configPath, profiles } = dependencies.readProfiles()
  const described = describeProfiles(dependencies, profiles)
  return {
    awsAvailable: await dependencies.awsAvailable(),
    configPath,
    profiles: described,
    selectedProfile: selectProfile(dependencies.storedProfile(), described)
  }
}

function readArgs(raw: unknown): { profile: string | null; useDeviceCode: boolean } {
  const args = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
  return {
    profile: normalizeAwsProfileName(typeof args?.profile === 'string' ? args.profile : null),
    useDeviceCode: args?.useDeviceCode === true
  }
}

/** The requested profile, but only if the config file actually defines it. */
function resolveKnownProfile(
  dependencies: AwsSsoDependencies,
  requested: string | null
): string | null {
  const { profiles } = dependencies.readProfiles()
  const described = describeProfiles(dependencies, profiles)
  const wanted = requested ?? selectProfile(dependencies.storedProfile(), described)
  return described.some((profile) => profile.name === wanted) ? wanted : null
}

async function login(
  sender: WebContents,
  raw: unknown,
  dependencies: AwsSsoDependencies
): Promise<AwsSsoLoginResult> {
  const { profile: requested, useDeviceCode } = readArgs(raw)
  const profile = resolveKnownProfile(dependencies, requested)
  if (!profile) {
    return { ok: false, reason: 'no-profile' }
  }

  activeLogin?.abort()
  const controller = new AbortController()
  activeLogin = controller

  const result = await dependencies.login(
    profile,
    { useDeviceCode },
    {
      signal: controller.signal,
      onProgress: (progress) => {
        if (!sender.isDestroyed()) {
          sender.send('awsSso:loginProgress', progress)
        }
      }
    }
  )

  if (activeLogin === controller) {
    activeLogin = null
  }
  // Remember the profile that just authenticated so the picker prefills next time.
  if (result.ok) {
    dependencies.saveProfile(profile)
  }
  return result
}

export function registerAwsSsoHandlers(
  dependencies: AwsSsoDependencies = defaultDependencies()
): void {
  ipcMain.handle('awsSso:getStatus', (): Promise<AwsSsoStatus> => getStatus(dependencies))

  ipcMain.handle('awsSso:setProfile', (_event, raw: unknown): Promise<AwsSsoStatus> => {
    dependencies.saveProfile(readArgs(raw).profile)
    return getStatus(dependencies)
  })

  ipcMain.handle(
    'awsSso:login',
    (event, raw: unknown): Promise<AwsSsoLoginResult> => login(event.sender, raw, dependencies)
  )

  ipcMain.handle('awsSso:cancelLogin', (): void => {
    activeLogin?.abort()
  })

  ipcMain.handle('awsSso:logout', async (_event, raw: unknown): Promise<void> => {
    const profile = resolveKnownProfile(dependencies, readArgs(raw).profile)
    if (profile) {
      await dependencies.logout(profile)
    }
  })
}

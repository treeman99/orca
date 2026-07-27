import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcState = vi.hoisted(() => ({
  handleHandlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      ipcState.handleHandlers.set(channel, handler)
    }
  }
}))

import { registerAwsSsoHandlers, type AwsSsoDependencies } from './aws-sso'
import type { AwsSsoLoginResult, AwsSsoProfile, AwsSsoStatus } from '../../shared/aws-sso-auth'

const NOW = new Date('2026-07-27T12:00:00Z')
const FUTURE = '2026-07-27T20:00:00Z'
const PAST = '2026-07-26T20:00:00Z'

const CORP: AwsSsoProfile = {
  name: 'bedrock',
  startUrl: 'https://corp.awsapps.com/start',
  ssoRegion: 'us-east-1',
  accountId: '123456789012',
  roleName: 'BedrockUser',
  sessionName: 'corp'
}

const OTHER: AwsSsoProfile = {
  name: 'sandbox',
  startUrl: 'https://sandbox.awsapps.com/start',
  ssoRegion: 'us-east-1',
  accountId: null,
  roleName: null,
  sessionName: null
}

function makeDeps(overrides: Partial<AwsSsoDependencies> = {}): AwsSsoDependencies {
  return {
    awsAvailable: vi.fn(async () => true),
    readProfiles: () => ({ configPath: '/home/dev/.aws/config', profiles: [CORP, OTHER] }),
    readTokenExpiries: () => new Map(),
    storedProfile: () => null,
    saveProfile: vi.fn(),
    login: vi.fn(async (profile: string) => ({ ok: true, profile }) as AwsSsoLoginResult),
    logout: vi.fn(async () => {}),
    now: () => NOW,
    ...overrides
  }
}

function fakeSender(): { send: ReturnType<typeof vi.fn>; isDestroyed: () => boolean } {
  return { send: vi.fn(), isDestroyed: () => false }
}

async function invoke(channel: string, sender: unknown, args?: unknown): Promise<unknown> {
  const handler = ipcState.handleHandlers.get(channel)
  if (!handler) {
    throw new Error(`${channel} was not registered`)
  }
  return handler({ sender }, args)
}

describe('registerAwsSsoHandlers', () => {
  beforeEach(() => {
    ipcState.handleHandlers.clear()
  })

  it('marks a profile active while its cached token is unexpired', async () => {
    registerAwsSsoHandlers(
      makeDeps({ readTokenExpiries: () => new Map([[CORP.startUrl, FUTURE]]) })
    )
    const status = (await invoke('awsSso:getStatus', fakeSender())) as AwsSsoStatus
    expect(
      status.profiles.map((profile) => [profile.name, profile.active, profile.expiresAt])
    ).toEqual([
      ['bedrock', true, FUTURE],
      ['sandbox', false, null]
    ])
    expect(status.configPath).toBe('/home/dev/.aws/config')
  })

  it('treats an expired token as not signed in', async () => {
    registerAwsSsoHandlers(makeDeps({ readTokenExpiries: () => new Map([[CORP.startUrl, PAST]]) }))
    const status = (await invoke('awsSso:getStatus', fakeSender())) as AwsSsoStatus
    expect(status.profiles[0]).toMatchObject({ name: 'bedrock', active: false, expiresAt: PAST })
  })

  it('preselects the signed-in profile when the user has not chosen one', async () => {
    registerAwsSsoHandlers(
      makeDeps({ readTokenExpiries: () => new Map([[OTHER.startUrl, FUTURE]]) })
    )
    const status = (await invoke('awsSso:getStatus', fakeSender())) as AwsSsoStatus
    expect(status.selectedProfile).toBe('sandbox')
  })

  it('prefers the user’s saved profile over a signed-in one', async () => {
    registerAwsSsoHandlers(
      makeDeps({
        storedProfile: () => 'bedrock',
        readTokenExpiries: () => new Map([[OTHER.startUrl, FUTURE]])
      })
    )
    const status = (await invoke('awsSso:getStatus', fakeSender())) as AwsSsoStatus
    expect(status.selectedProfile).toBe('bedrock')
  })

  it('falls back to the first profile when the saved one is gone from the config', async () => {
    registerAwsSsoHandlers(makeDeps({ storedProfile: () => 'deleted-profile' }))
    const status = (await invoke('awsSso:getStatus', fakeSender())) as AwsSsoStatus
    expect(status.selectedProfile).toBe('bedrock')
  })

  it('reports the CLI as missing without failing the status read', async () => {
    registerAwsSsoHandlers(makeDeps({ awsAvailable: vi.fn(async () => false) }))
    const status = (await invoke('awsSso:getStatus', fakeSender())) as AwsSsoStatus
    expect(status.awsAvailable).toBe(false)
    expect(status.profiles).toHaveLength(2)
  })

  it('reports no profiles when there is no AWS config file', async () => {
    registerAwsSsoHandlers(makeDeps({ readProfiles: () => ({ configPath: null, profiles: [] }) }))
    const status = (await invoke('awsSso:getStatus', fakeSender())) as AwsSsoStatus
    expect(status).toMatchObject({ configPath: null, profiles: [], selectedProfile: null })
  })

  it('runs the login for the requested profile and forwards the device-code choice', async () => {
    const login = vi.fn(async (profile: string) => ({ ok: true, profile }) as AwsSsoLoginResult)
    const saveProfile = vi.fn()
    registerAwsSsoHandlers(makeDeps({ login, saveProfile }))

    const result = await invoke('awsSso:login', fakeSender(), {
      profile: 'sandbox',
      useDeviceCode: true
    })

    expect(result).toEqual({ ok: true, profile: 'sandbox' })
    expect(login).toHaveBeenCalledWith('sandbox', { useDeviceCode: true }, expect.anything())
    expect(saveProfile).toHaveBeenCalledWith('sandbox')
  })

  it('refuses a profile the AWS config does not define instead of spawning the CLI', async () => {
    const login = vi.fn()
    registerAwsSsoHandlers(makeDeps({ login }))

    const result = await invoke('awsSso:login', fakeSender(), {
      profile: 'not-in-config',
      useDeviceCode: false
    })

    expect(result).toEqual({ ok: false, reason: 'no-profile' })
    expect(login).not.toHaveBeenCalled()
  })

  it('falls back to the selected profile when the request names none', async () => {
    const login = vi.fn(async (profile: string) => ({ ok: true, profile }) as AwsSsoLoginResult)
    registerAwsSsoHandlers(makeDeps({ login, storedProfile: () => 'sandbox' }))

    await invoke('awsSso:login', fakeSender(), {})

    expect(login).toHaveBeenCalledWith('sandbox', { useDeviceCode: false }, expect.anything())
  })

  it('streams login progress to the renderer', async () => {
    const sender = fakeSender()
    registerAwsSsoHandlers(
      makeDeps({
        login: async (profile, _options, deps) => {
          deps.onProgress({
            userCode: 'WXYZ-1234',
            verificationUrl: 'https://device.sso.us-east-1.amazonaws.com/',
            usingDeviceCode: true
          })
          return { ok: true, profile }
        }
      })
    )

    await invoke('awsSso:login', sender, { profile: 'bedrock', useDeviceCode: true })

    expect(sender.send).toHaveBeenCalledWith('awsSso:loginProgress', {
      userCode: 'WXYZ-1234',
      verificationUrl: 'https://device.sso.us-east-1.amazonaws.com/',
      usingDeviceCode: true
    })
  })

  it('does not remember a profile whose login failed', async () => {
    const saveProfile = vi.fn()
    registerAwsSsoHandlers(
      makeDeps({
        saveProfile,
        login: async () => ({ ok: false, reason: 'failed', message: 'nope' })
      })
    )

    const result = await invoke('awsSso:login', fakeSender(), { profile: 'bedrock' })

    expect(result).toEqual({ ok: false, reason: 'failed', message: 'nope' })
    expect(saveProfile).not.toHaveBeenCalled()
  })

  it('cancels an in-flight login through the abort signal', async () => {
    const observed: { signal: AbortSignal | null } = { signal: null }
    registerAwsSsoHandlers(
      makeDeps({
        login: (_profile, _options, deps) =>
          new Promise((resolve) => {
            observed.signal = deps.signal ?? null
            deps.signal?.addEventListener('abort', () =>
              resolve({ ok: false, reason: 'cancelled' })
            )
          })
      })
    )

    const pending = invoke('awsSso:login', fakeSender(), { profile: 'bedrock' })
    await Promise.resolve()
    await invoke('awsSso:cancelLogin', fakeSender())

    expect(await pending).toEqual({ ok: false, reason: 'cancelled' })
    expect(observed.signal?.aborted).toBe(true)
  })

  it('logs out the resolved profile and ignores an unknown one', async () => {
    const logout = vi.fn(async () => {})
    registerAwsSsoHandlers(makeDeps({ logout, storedProfile: () => 'bedrock' }))

    await invoke('awsSso:logout', fakeSender(), { profile: 'sandbox' })
    await invoke('awsSso:logout', fakeSender(), { profile: 'not-in-config' })

    expect(logout).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledWith('sandbox')
  })

  it('saves and clears the picker’s profile', async () => {
    const saveProfile = vi.fn()
    registerAwsSsoHandlers(makeDeps({ saveProfile }))

    await invoke('awsSso:setProfile', fakeSender(), { profile: ' bedrock ' })
    await invoke('awsSso:setProfile', fakeSender(), { profile: '   ' })

    expect(saveProfile).toHaveBeenNthCalledWith(1, 'bedrock')
    expect(saveProfile).toHaveBeenNthCalledWith(2, null)
  })
})

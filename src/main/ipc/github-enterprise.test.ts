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

import { registerGithubEnterpriseHandlers } from './github-enterprise'
import type {
  GithubEnterpriseLoginProgress,
  GithubEnterpriseLoginResult
} from '../../shared/github-enterprise-auth'

type Deps = Parameters<typeof registerGithubEnterpriseHandlers>[0]

function makeDeps(overrides: Partial<NonNullable<Deps>> = {}): NonNullable<Deps> {
  return {
    policyHost: () => null,
    storedHost: () => null,
    ghHostEnv: () => null,
    saveHost: vi.fn(),
    diagnose: vi.fn(async () => ({ ghAvailable: true, authenticated: true, account: 'dev-user' })),
    login: vi.fn(async () => ({ ok: true, account: 'dev-user' }) as GithubEnterpriseLoginResult),
    loginWithToken: vi.fn(async () => ({ ok: true, account: null }) as GithubEnterpriseLoginResult),
    logout: vi.fn(async () => {}),
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

describe('registerGithubEnterpriseHandlers', () => {
  beforeEach(() => {
    ipcState.handleHandlers.clear()
  })

  it('reports no host when neither the user nor the policy set one', async () => {
    registerGithubEnterpriseHandlers(makeDeps())
    expect(await invoke('githubEnterprise:getStatus', fakeSender())).toEqual({
      ghAvailable: true,
      host: null,
      authenticated: false,
      account: null,
      effectiveHost: 'github.com',
      effectiveHostSource: 'default'
    })
  })

  it('diagnoses the effective host, preferring the stored host over the policy host', async () => {
    const diagnose = vi.fn(async () => ({
      ghAvailable: true,
      authenticated: true,
      account: 'dev-user'
    }))
    registerGithubEnterpriseHandlers(
      makeDeps({
        storedHost: () => 'stored.corp.net',
        policyHost: () => 'policy.corp.net',
        diagnose
      })
    )
    expect(await invoke('githubEnterprise:getStatus', fakeSender())).toEqual({
      ghAvailable: true,
      host: 'stored.corp.net',
      authenticated: true,
      account: 'dev-user',
      effectiveHost: 'stored.corp.net',
      effectiveHostSource: 'user-setting'
    })
    expect(diagnose).toHaveBeenCalledWith('stored.corp.net')
  })

  // GH_HOST is gh's own variable and outranks anything Orca stores, so the readout must
  // report it — telling a user their requests go to the policy host when gh disagrees
  // would be worse than showing nothing.
  it('reports GH_HOST ahead of the stored and policy hosts', async () => {
    registerGithubEnterpriseHandlers(
      makeDeps({
        ghHostEnv: () => 'ghhost.corp.net',
        storedHost: () => 'stored.corp.net',
        policyHost: () => 'policy.corp.net'
      })
    )
    expect(await invoke('githubEnterprise:getStatus', fakeSender())).toMatchObject({
      host: 'stored.corp.net',
      effectiveHost: 'ghhost.corp.net',
      effectiveHostSource: 'gh-host-env'
    })
  })

  it('reports the policy host as the effective one when nothing outranks it', async () => {
    registerGithubEnterpriseHandlers(makeDeps({ policyHost: () => 'policy.corp.net' }))
    expect(await invoke('githubEnterprise:getStatus', fakeSender())).toMatchObject({
      effectiveHost: 'policy.corp.net',
      effectiveHostSource: 'enterprise-policy'
    })
  })

  it('falls back to the policy host when the user saved none', async () => {
    const diagnose = vi.fn(async () => ({ ghAvailable: true, authenticated: false, account: null }))
    registerGithubEnterpriseHandlers(makeDeps({ policyHost: () => 'policy.corp.net', diagnose }))
    await invoke('githubEnterprise:getStatus', fakeSender())
    expect(diagnose).toHaveBeenCalledWith('policy.corp.net')
  })

  it('persists a normalized host on setHost', async () => {
    const saveHost = vi.fn()
    registerGithubEnterpriseHandlers(makeDeps({ saveHost }))
    await invoke('githubEnterprise:setHost', fakeSender(), { host: 'https://GitHub.Corp.net/' })
    expect(saveHost).toHaveBeenCalledWith('github.corp.net')
  })

  it('refuses login when no host is available', async () => {
    const login = vi.fn()
    registerGithubEnterpriseHandlers(makeDeps({ login }))
    const result = await invoke('githubEnterprise:login', fakeSender(), {})
    expect(result).toEqual({ ok: false, reason: 'no-host' })
    expect(login).not.toHaveBeenCalled()
  })

  it('logs in with the requested host, forwards progress, and saves the host on success', async () => {
    const saveHost = vi.fn()
    const login = vi.fn(
      async (
        _host: string,
        deps: { onProgress: (p: GithubEnterpriseLoginProgress) => void }
      ): Promise<GithubEnterpriseLoginResult> => {
        deps.onProgress({ oneTimeCode: 'ABCD-1234', verificationUrl: 'https://x/login/device' })
        return { ok: true, account: 'dev-user' }
      }
    )
    registerGithubEnterpriseHandlers(makeDeps({ login, saveHost }))
    const sender = fakeSender()

    const result = await invoke('githubEnterprise:login', sender, { host: 'gh.corp.net' })

    expect(login).toHaveBeenCalledWith(
      'gh.corp.net',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(sender.send).toHaveBeenCalledWith('githubEnterprise:loginProgress', {
      oneTimeCode: 'ABCD-1234',
      verificationUrl: 'https://x/login/device'
    })
    expect(saveHost).toHaveBeenCalledWith('gh.corp.net')
    expect(result).toEqual({ ok: true, account: 'dev-user' })
  })

  it('does not save the host when login fails', async () => {
    const saveHost = vi.fn()
    registerGithubEnterpriseHandlers(
      makeDeps({
        saveHost,
        login: vi.fn(async () => ({ ok: false, reason: 'timeout' }) as GithubEnterpriseLoginResult)
      })
    )
    await invoke('githubEnterprise:login', fakeSender(), { host: 'gh.corp.net' })
    expect(saveHost).not.toHaveBeenCalled()
  })

  it('logs in with a token, then saves the host on success', async () => {
    const saveHost = vi.fn()
    const loginWithToken = vi.fn(
      async () => ({ ok: true, account: null }) as GithubEnterpriseLoginResult
    )
    registerGithubEnterpriseHandlers(makeDeps({ saveHost, loginWithToken }))
    const result = await invoke('githubEnterprise:loginWithToken', fakeSender(), {
      host: 'gh.corp.net',
      token: 'ghp_secret'
    })
    expect(loginWithToken).toHaveBeenCalledWith('gh.corp.net', 'ghp_secret')
    expect(saveHost).toHaveBeenCalledWith('gh.corp.net')
    expect(result).toEqual({ ok: true, account: null })
  })

  it('refuses token login when no host is available', async () => {
    const loginWithToken = vi.fn()
    registerGithubEnterpriseHandlers(makeDeps({ loginWithToken }))
    const result = await invoke('githubEnterprise:loginWithToken', fakeSender(), {
      token: 'ghp_secret'
    })
    expect(result).toEqual({ ok: false, reason: 'no-host' })
    expect(loginWithToken).not.toHaveBeenCalled()
  })

  it('logs out of the effective host', async () => {
    const logout = vi.fn(async () => {})
    registerGithubEnterpriseHandlers(makeDeps({ storedHost: () => 'gh.corp.net', logout }))
    await invoke('githubEnterprise:logout', fakeSender(), {})
    expect(logout).toHaveBeenCalledWith('gh.corp.net')
  })
})

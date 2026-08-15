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

// Why: every handler here runs on injected dependencies, so the real CLI-spawning modules
// only ever contribute the default wiring — which no test exercises.
vi.mock('../gateway/gateway-cli-availability', () => ({ detectGatewayCli: vi.fn() }))
vi.mock('../gateway/gateway-verify', () => ({ runGatewayVerify: vi.fn() }))
vi.mock('../gateway/gateway-login', () => ({ runGatewayLogin: vi.fn() }))

import { registerGatewayHandlers, type GatewayDependencies } from './gateway'
import type { GatewayLoginResult, GatewayStatus } from '../../shared/gateway-auth'

const SIGNED_IN = {
  signedIn: true,
  expiresAt: '2026-08-16T09:00:00Z',
  identity: 'daegun@corp',
  detail: 'session active'
}

function makeDeps(overrides: Partial<GatewayDependencies> = {}): GatewayDependencies {
  return {
    available: vi.fn(async () => ({ available: true, version: '1.4.0' })),
    verify: vi.fn(async () => SIGNED_IN),
    login: vi.fn(async () => ({ ok: true }) as GatewayLoginResult),
    ...overrides
  }
}

function fakeSender(destroyed = false): {
  send: ReturnType<typeof vi.fn>
  isDestroyed: () => boolean
} {
  return { send: vi.fn(), isDestroyed: () => destroyed }
}

async function invoke(channel: string, sender: unknown): Promise<unknown> {
  const handler = ipcState.handleHandlers.get(channel)
  if (!handler) {
    throw new Error(`${channel} was not registered`)
  }
  return handler({ sender })
}

describe('registerGatewayHandlers', () => {
  beforeEach(() => {
    ipcState.handleHandlers.clear()
  })

  it('registers only the three invokable channels — there is no logout', () => {
    registerGatewayHandlers(makeDeps())
    expect([...ipcState.handleHandlers.keys()].sort()).toEqual([
      'gateway:cancelLogin',
      'gateway:getStatus',
      'gateway:login'
    ])
  })

  it('reports the CLI as missing without asking verify about a session', async () => {
    const verify = vi.fn(async () => SIGNED_IN)
    registerGatewayHandlers(
      makeDeps({ available: async () => ({ available: false, version: null }), verify })
    )

    const status = (await invoke('gateway:getStatus', fakeSender())) as GatewayStatus

    expect(status).toEqual({
      gatewayAvailable: false,
      version: null,
      signedIn: false,
      expiresAt: null,
      identity: null,
      detail: null
    })
    expect(verify).not.toHaveBeenCalled()
  })

  it('passes the verified session through alongside the reported version', async () => {
    registerGatewayHandlers(makeDeps())

    const status = (await invoke('gateway:getStatus', fakeSender())) as GatewayStatus

    expect(status).toEqual({ gatewayAvailable: true, version: '1.4.0', ...SIGNED_IN })
  })

  it('keeps a signed-out verification distinguishable from a missing CLI', async () => {
    registerGatewayHandlers(
      makeDeps({
        available: async () => ({ available: true, version: null }),
        verify: async () => ({
          signedIn: false,
          expiresAt: null,
          identity: null,
          detail: 'not logged in'
        })
      })
    )

    const status = (await invoke('gateway:getStatus', fakeSender())) as GatewayStatus

    expect(status).toMatchObject({
      gatewayAvailable: true,
      signedIn: false,
      detail: 'not logged in'
    })
  })

  it('streams login progress to the renderer', async () => {
    const sender = fakeSender()
    registerGatewayHandlers(
      makeDeps({
        login: async (deps) => {
          deps.onProgress({ userCode: 'WXYZ-1234', verificationUrl: 'https://gw.corp/device' })
          return { ok: true }
        }
      })
    )

    await invoke('gateway:login', sender)

    expect(sender.send).toHaveBeenCalledWith('gateway:loginProgress', {
      userCode: 'WXYZ-1234',
      verificationUrl: 'https://gw.corp/device'
    })
  })

  it('drops progress aimed at a renderer that is already gone', async () => {
    const sender = fakeSender(true)
    registerGatewayHandlers(
      makeDeps({
        login: async (deps) => {
          deps.onProgress({ userCode: 'WXYZ-1234', verificationUrl: null })
          return { ok: true }
        }
      })
    )

    await invoke('gateway:login', sender)

    expect(sender.send).not.toHaveBeenCalled()
  })

  it('aborts the login in flight when a second one starts', async () => {
    const signals: AbortSignal[] = []
    registerGatewayHandlers(
      makeDeps({
        login: (deps) =>
          new Promise((resolve) => {
            if (deps.signal) {
              signals.push(deps.signal)
            }
            deps.signal?.addEventListener('abort', () =>
              resolve({ ok: false, reason: 'cancelled' })
            )
          })
      })
    )

    const first = invoke('gateway:login', fakeSender())
    await Promise.resolve()
    const second = invoke('gateway:login', fakeSender())
    await Promise.resolve()

    expect(await first).toEqual({ ok: false, reason: 'cancelled' })
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)

    await invoke('gateway:cancelLogin', fakeSender())
    expect(await second).toEqual({ ok: false, reason: 'cancelled' })
  })

  it('cancels an in-flight login through the abort signal', async () => {
    const observed: { signal: AbortSignal | null } = { signal: null }
    registerGatewayHandlers(
      makeDeps({
        login: (deps) =>
          new Promise((resolve) => {
            observed.signal = deps.signal ?? null
            deps.signal?.addEventListener('abort', () =>
              resolve({ ok: false, reason: 'cancelled' })
            )
          })
      })
    )

    const pending = invoke('gateway:login', fakeSender())
    await Promise.resolve()
    await invoke('gateway:cancelLogin', fakeSender())

    expect(await pending).toEqual({ ok: false, reason: 'cancelled' })
    expect(observed.signal?.aborted).toBe(true)
  })

  it('leaves nothing to abort once a login has settled', async () => {
    const login = vi.fn(async () => ({ ok: true }) as GatewayLoginResult)
    registerGatewayHandlers(makeDeps({ login }))

    await invoke('gateway:login', fakeSender())
    await invoke('gateway:cancelLogin', fakeSender())

    expect(await invoke('gateway:login', fakeSender())).toEqual({ ok: true })
    expect(login).toHaveBeenCalledTimes(2)
  })
})

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

import { registerCorporateLlmEndpointHandlers } from './corporate-llm-endpoints'
import type { CorporateLlmTokenWriteResult } from '../enterprise/corporate-llm-token-store'
import type {
  CorporateLlmEndpointStatus,
  CorporateLlmTokenSaveResult
} from '../../shared/corporate-llm-endpoint-status'
import type { EnterpriseLlmEndpoint } from '../../shared/enterprise-llm-endpoints'

const ENDPOINT: EnterpriseLlmEndpoint = {
  id: 'ds-llm',
  label: '사내 LLM',
  baseUrl: 'https://llm.samsungds.net/v1',
  api: 'openai',
  model: 'qwen3-coder'
}

const TOKEN = 'sk-corp-secret'

function register(overrides: {
  endpoints?: readonly EnterpriseLlmEndpoint[]
  saved?: Set<string>
  write?: (endpointId: string, token: string) => CorporateLlmTokenWriteResult
}) {
  const saved = overrides.saved ?? new Set<string>()
  const write =
    overrides.write ??
    ((endpointId: string, token: string): CorporateLlmTokenWriteResult => {
      if (token.trim()) {
        saved.add(endpointId)
      } else {
        saved.delete(endpointId)
      }
      return { ok: true }
    })
  const writeToken = vi.fn(write)
  registerCorporateLlmEndpointHandlers({
    listEndpoints: () => overrides.endpoints ?? [ENDPOINT],
    hasToken: (endpointId: string) => saved.has(endpointId),
    writeToken
  })
  return { saved, writeToken }
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = ipcState.handleHandlers.get(channel)
  if (!handler) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return (await handler({}, ...args)) as T
}

describe('registerCorporateLlmEndpointHandlers', () => {
  beforeEach(() => {
    ipcState.handleHandlers.clear()
  })

  it('registers the three corporate LLM endpoint channels', () => {
    register({})
    expect(ipcState.handleHandlers.has('corporateLlmEndpoints:list')).toBe(true)
    expect(ipcState.handleHandlers.has('corporateLlmEndpoints:saveToken')).toBe(true)
    expect(ipcState.handleHandlers.has('corporateLlmEndpoints:clearToken')).toBe(true)
  })

  it('lists the policy-provisioned endpoints with their saved-token state', async () => {
    register({ saved: new Set(['ds-llm']) })
    const endpoints = await invoke<CorporateLlmEndpointStatus[]>('corporateLlmEndpoints:list')
    expect(endpoints).toEqual([{ ...ENDPOINT, hasToken: true }])
  })

  it('saves a token and reports the endpoint as configured', async () => {
    const { saved, writeToken } = register({})
    const result = await invoke<CorporateLlmTokenSaveResult>('corporateLlmEndpoints:saveToken', {
      endpointId: 'ds-llm',
      token: TOKEN
    })
    expect(writeToken).toHaveBeenCalledWith('ds-llm', TOKEN)
    expect(result).toEqual({ ok: true, hasToken: true })
    expect(saved.has('ds-llm')).toBe(true)
  })

  it('clears a token by writing the empty string the store reads as a clear', async () => {
    const { saved, writeToken } = register({ saved: new Set(['ds-llm']) })
    const result = await invoke<CorporateLlmTokenSaveResult>('corporateLlmEndpoints:clearToken', {
      endpointId: 'ds-llm'
    })
    expect(writeToken).toHaveBeenCalledWith('ds-llm', '')
    expect(result).toEqual({ ok: true, hasToken: false })
    expect(saved.has('ds-llm')).toBe(false)
  })

  // The renderer must not be able to create a token file for an endpoint no
  // administrator provisioned, whatever id it sends.
  it('refuses an endpoint id the policy does not define, without touching the store', async () => {
    const { writeToken } = register({})
    const result = await invoke<CorporateLlmTokenSaveResult>('corporateLlmEndpoints:saveToken', {
      endpointId: 'attacker-endpoint',
      token: TOKEN
    })
    expect(result).toEqual({ ok: false, reason: 'unknown-endpoint' })
    expect(writeToken).not.toHaveBeenCalled()
  })

  it('refuses an id the store cannot use as a file name as unknown-endpoint', async () => {
    register({
      endpoints: [{ ...ENDPOINT, id: '../escape' }],
      write: () => ({ ok: false, reason: 'unsupported-id' })
    })
    const result = await invoke<CorporateLlmTokenSaveResult>('corporateLlmEndpoints:saveToken', {
      endpointId: '../escape',
      token: TOKEN
    })
    expect(result).toEqual({ ok: false, reason: 'unknown-endpoint' })
  })

  // Distinguishable on purpose: the store refuses to write a plaintext token, and
  // the user has to be told that rather than retrying a generic failure.
  it('reports encryption-unavailable separately from other write failures', async () => {
    register({ write: () => ({ ok: false, reason: 'encryption-unavailable' }) })
    const result = await invoke<CorporateLlmTokenSaveResult>('corporateLlmEndpoints:saveToken', {
      endpointId: 'ds-llm',
      token: TOKEN
    })
    expect(result).toEqual({ ok: false, reason: 'encryption-unavailable' })
  })

  it('reports a failed write as write-failed', async () => {
    register({ write: () => ({ ok: false, reason: 'write-failed' }) })
    const result = await invoke<CorporateLlmTokenSaveResult>('corporateLlmEndpoints:clearToken', {
      endpointId: 'ds-llm'
    })
    expect(result).toEqual({ ok: false, reason: 'write-failed' })
  })

  it('never returns the token in any response', async () => {
    register({})
    const responses = [
      await invoke('corporateLlmEndpoints:saveToken', { endpointId: 'ds-llm', token: TOKEN }),
      await invoke('corporateLlmEndpoints:list'),
      await invoke('corporateLlmEndpoints:clearToken', { endpointId: 'ds-llm' })
    ]
    expect(JSON.stringify(responses)).not.toContain(TOKEN)
  })

  it('rejects malformed arguments instead of writing them', async () => {
    const { writeToken } = register({})
    await expect(invoke('corporateLlmEndpoints:saveToken', { token: TOKEN })).rejects.toThrow(
      /endpointId/
    )
    await expect(
      invoke('corporateLlmEndpoints:saveToken', { endpointId: 'ds-llm' })
    ).rejects.toThrow(/token must be a string/)
    await expect(
      invoke('corporateLlmEndpoints:saveToken', { endpointId: 'ds-llm', token: 'x'.repeat(8193) })
    ).rejects.toThrow(/too long/)
    await expect(invoke('corporateLlmEndpoints:clearToken', undefined)).rejects.toThrow(
      /endpointId/
    )
    expect(writeToken).not.toHaveBeenCalled()
  })
})

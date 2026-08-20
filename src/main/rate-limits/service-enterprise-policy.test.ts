// Fork-owned: proves disableUsagePolling and allowedAgents stop the vendor usage
// fetches themselves, not just the chips that display them. Kept in its own file so an
// upstream split of the service suite cannot carry the gate away with it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitService } from './service'
import { fetchClaudeRateLimits, fetchManagedAccountUsage } from './claude-fetcher'
import { consumeCodexRateLimitResetCredit, fetchCodexRateLimits } from './codex-fetcher'
import { fetchGeminiRateLimits } from './gemini-usage-fetcher'
import { fetchKimiRateLimits } from './kimi-fetcher'
import { fetchMiniMaxRateLimits } from './minimax-fetcher'
import { fetchGrokRateLimits } from './grok-fetcher'
import { fetchOpenCodeGoRateLimits } from './opencode-go-usage-fetcher'
import {
  asRateLimitWindow,
  FakeRateLimitWindow,
  okProvider,
  resetRateLimitProviderMocks
} from './rate-limit-service-test-harness'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../../shared/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.fn(() => makeEnterprisePolicy())

vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: () => getEnterprisePolicyMock()
}))
vi.mock('./claude-fetcher', () => ({
  fetchClaudeRateLimits: vi.fn(),
  fetchManagedAccountUsage: vi.fn()
}))
vi.mock('./codex-fetcher', () => ({
  consumeCodexRateLimitResetCredit: vi.fn(),
  fetchCodexRateLimits: vi.fn()
}))
vi.mock('./gemini-usage-fetcher', () => ({ fetchGeminiRateLimits: vi.fn() }))
vi.mock('./kimi-fetcher', () => ({ fetchKimiRateLimits: vi.fn() }))
vi.mock('./opencode-go-usage-fetcher', () => ({ fetchOpenCodeGoRateLimits: vi.fn() }))
vi.mock('./minimax-fetcher', () => ({ fetchMiniMaxRateLimits: vi.fn() }))
vi.mock('./grok-fetcher', () => ({ fetchGrokRateLimits: vi.fn() }))
vi.mock('./grok-auth', () => ({ readGrokAuthSession: vi.fn(() => ({ status: 'missing' })) }))
vi.mock('../minimax/minimax-cookie-store', () => ({
  hasMiniMaxSessionCookie: vi.fn(() => false)
}))

function expectNoVendorUsageFetches(): void {
  expect(fetchClaudeRateLimits).not.toHaveBeenCalled()
  expect(fetchManagedAccountUsage).not.toHaveBeenCalled()
  expect(fetchCodexRateLimits).not.toHaveBeenCalled()
  expect(fetchGeminiRateLimits).not.toHaveBeenCalled()
  expect(fetchOpenCodeGoRateLimits).not.toHaveBeenCalled()
  expect(fetchKimiRateLimits).not.toHaveBeenCalled()
  expect(fetchMiniMaxRateLimits).not.toHaveBeenCalled()
  expect(fetchGrokRateLimits).not.toHaveBeenCalled()
}

describe('RateLimitService under an agent allowlist', () => {
  beforeEach(() => {
    resetRateLimitProviderMocks()
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
  })

  it('does not poll non-allowed vendors under a Bedrock-only allowlist', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy({ allowedAgents: ['claude'] }))
    vi.mocked(fetchClaudeRateLimits).mockResolvedValue(okProvider('claude', 12))
    const service = new RateLimitService()

    await service.refresh()

    // Claude is the Bedrock agent — it still polls.
    expect(fetchClaudeRateLimits).toHaveBeenCalledTimes(1)
    // Every other vendor is off the allowlist, so none may phone home.
    expect(fetchCodexRateLimits).not.toHaveBeenCalled()
    expect(fetchGeminiRateLimits).not.toHaveBeenCalled()
    expect(fetchOpenCodeGoRateLimits).not.toHaveBeenCalled()
    expect(fetchKimiRateLimits).not.toHaveBeenCalled()
    expect(fetchMiniMaxRateLimits).not.toHaveBeenCalled()
    expect(fetchGrokRateLimits).not.toHaveBeenCalled()
    expect(service.getState().claude?.status).toBe('ok')
    expect(service.getState().codex?.status).toBe('unavailable')
    expect(service.getState().grok?.status).toBe('unavailable')
  })
})

describe('RateLimitService under enterprise policy lockdown', () => {
  beforeEach(() => {
    resetRateLimitProviderMocks()
    getEnterprisePolicyMock.mockReturnValue(makeEnterprisePolicy())
  })

  it('arms no poll timer and runs no fetch when usage polling is disabled', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    vi.useFakeTimers()
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    try {
      vi.mocked(fetchClaudeRateLimits).mockResolvedValue(okProvider('claude', 12))
      vi.mocked(fetchCodexRateLimits).mockResolvedValue(okProvider('codex', 24))
      const service = new RateLimitService()
      const window = new FakeRateLimitWindow()

      service.attach(asRateLimitWindow(window))
      service.start()
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

      expect(intervalSpy).not.toHaveBeenCalled()
      expectNoVendorUsageFetches()

      // Window activation is a second polling trigger that never goes through start().
      window.emit('focus')
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expectNoVendorUsageFetches()

      // The un-started service must stay safe to drive from IPC.
      service.stop()
      expect(service.getState().claude?.status).toBe('unavailable')
    } finally {
      intervalSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('blocks user-initiated refreshes while usage polling is disabled', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    vi.mocked(fetchClaudeRateLimits).mockResolvedValue(okProvider('claude', 12))
    vi.mocked(fetchCodexRateLimits).mockResolvedValue(okProvider('codex', 24))
    const service = new RateLimitService()
    service.setInactiveClaudeAccountsResolver(() => [
      { id: 'account-1', managedAuthPath: '/tmp/account-1/auth' }
    ])
    service.setInactiveCodexAccountsResolver(() => [
      {
        id: 'account-2',
        resolveHome: () => ({ kind: 'ready', managedHomePath: '/tmp/account-2/home' })
      }
    ])

    await service.refresh()
    await service.refreshIfStale()
    await service.refreshGrok()
    await service.fetchInactiveClaudeAccountsOnOpen()
    await service.fetchInactiveCodexAccountsOnOpen()
    await service.refreshForClaudeAccountChange('account-1')
    await service.refreshForCodexAccountChange('account-2')
    await service.refreshCodexForTarget({ runtime: 'host', wslDistro: null })
    const state = await service.refreshClaudeForTarget({ runtime: 'host', wslDistro: null })

    expectNoVendorUsageFetches()
    // A blocked cycle must not leave the chip spinning forever.
    expect(state.claude?.status).toBe('unavailable')
    expect(state.codex?.status).toBe('unavailable')
  })

  it('settles every provider slot as unavailable while usage polling is disabled', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    const service = new RateLimitService()

    // A slot the renderer sees as null becomes a permanently animating "…" chip, so no slot may stay empty.
    const state = service.getState()
    for (const provider of [
      state.claude,
      state.codex,
      state.gemini,
      state.opencodeGo,
      state.kimi,
      state.antigravity,
      state.minimax,
      state.grok
    ]) {
      expect(provider?.status).toBe('unavailable')
      expect(provider?.error).toBeNull()
    }
    expect(state.claude?.provider).toBe('claude')
    expect(state.opencodeGo?.provider).toBe('opencode-go')
  })

  it('leaves provider slots empty before the first fetch when no policy disables polling', () => {
    const service = new RateLimitService()

    const state = service.getState()
    expect(state.claude).toBeNull()
    expect(state.codex).toBeNull()
    expect(state.grok).toBeNull()
  })

  it('refuses to consume a Codex reset credit while usage polling is disabled', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    const service = new RateLimitService()

    await expect(
      service.consumeCodexRateLimitResetCredit({
        idempotencyKey: 'lockdown-reset',
        target: { runtime: 'host', wslDistro: null },
        codexHomePath: '/tmp/codex-home'
      })
    ).rejects.toThrow(/enterprise policy/)
    expect(consumeCodexRateLimitResetCredit).not.toHaveBeenCalled()
    expectNoVendorUsageFetches()
  })

  it('still polls under lockdown when usage polling is explicitly opted back in', async () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy({ disableUsagePolling: false }))
    vi.useFakeTimers()
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    try {
      vi.mocked(fetchClaudeRateLimits).mockResolvedValue(okProvider('claude', 12))
      vi.mocked(fetchCodexRateLimits).mockResolvedValue(okProvider('codex', 24))
      const service = new RateLimitService()

      service.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 15 * 60 * 1000)
      expect(fetchClaudeRateLimits).toHaveBeenCalledTimes(1)
      expect(fetchCodexRateLimits).toHaveBeenCalledTimes(1)

      service.stop()
    } finally {
      intervalSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('polls normally when no policy file locks the machine down', async () => {
    vi.useFakeTimers()
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    try {
      vi.mocked(fetchClaudeRateLimits).mockResolvedValue(okProvider('claude', 12))
      vi.mocked(fetchCodexRateLimits).mockResolvedValue(okProvider('codex', 24))
      const service = new RateLimitService()

      service.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 15 * 60 * 1000)
      expect(fetchClaudeRateLimits).toHaveBeenCalledTimes(1)
      expect(fetchGrokRateLimits).toHaveBeenCalledTimes(1)
      expect(service.getState().claude?.status).toBe('ok')

      service.stop()
    } finally {
      intervalSpy.mockRestore()
      vi.useRealTimers()
    }
  })
})

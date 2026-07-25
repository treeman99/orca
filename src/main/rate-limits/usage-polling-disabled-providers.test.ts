import { describe, expect, it } from 'vitest'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'
import {
  settleUsagePollingDisabledProviders,
  type UsageProviderSlots
} from './usage-polling-disabled-providers'

const EMPTY_SLOTS: UsageProviderSlots = {
  claude: null,
  codex: null,
  gemini: null,
  opencodeGo: null,
  kimi: null,
  antigravity: null,
  minimax: null,
  grok: null
}

function okClaude(): ProviderRateLimits {
  return {
    provider: 'claude',
    session: { usedPercent: 12, windowMinutes: 300, resetsAt: null, resetDescription: null },
    weekly: null,
    updatedAt: 1,
    error: null,
    status: 'ok'
  }
}

describe('settleUsagePollingDisabledProviders', () => {
  it('returns the slots untouched when polling is allowed', () => {
    expect(settleUsagePollingDisabledProviders(EMPTY_SLOTS, false)).toBe(EMPTY_SLOTS)
  })

  it('settles every empty slot as unavailable when polling is disabled', () => {
    const settled = settleUsagePollingDisabledProviders(EMPTY_SLOTS, true)

    expect(Object.values(settled).map((provider) => provider?.status)).toEqual(
      Array.from({ length: 8 }, () => 'unavailable')
    )
    expect(settled.claude).toEqual({
      provider: 'claude',
      session: null,
      weekly: null,
      updatedAt: 0,
      error: null,
      status: 'unavailable'
    })
    // The renderer keys its provider row off this id, so the slot name must not leak through.
    expect(settled.opencodeGo?.provider).toBe('opencode-go')
    expect(settled.antigravity?.provider).toBe('antigravity')
  })

  it('keeps data that reached a slot without a poll cycle', () => {
    const claude = okClaude()

    const settled = settleUsagePollingDisabledProviders({ ...EMPTY_SLOTS, claude }, true)

    expect(settled.claude).toBe(claude)
    expect(settled.codex?.status).toBe('unavailable')
  })

  it('does not mutate the slots it was given', () => {
    const slots: UsageProviderSlots = { ...EMPTY_SLOTS }

    settleUsagePollingDisabledProviders(slots, true)

    expect(slots).toEqual(EMPTY_SLOTS)
  })
})

import type { ProviderRateLimits } from '../../shared/rate-limit-types'

export type UsageProviderSlots = {
  claude: ProviderRateLimits | null
  codex: ProviderRateLimits | null
  gemini: ProviderRateLimits | null
  opencodeGo: ProviderRateLimits | null
  kimi: ProviderRateLimits | null
  antigravity: ProviderRateLimits | null
  minimax: ProviderRateLimits | null
  grok: ProviderRateLimits | null
}

const PROVIDER_BY_SLOT: Record<keyof UsageProviderSlots, ProviderRateLimits['provider']> = {
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
  opencodeGo: 'opencode-go',
  kimi: 'kimi',
  antigravity: 'antigravity',
  minimax: 'minimax',
  grok: 'grok'
}

function unavailableSnapshot(provider: ProviderRateLimits['provider']): ProviderRateLimits {
  // Why: leave `error` null so the renderer supplies its own localized "Unavailable" copy.
  return {
    provider,
    session: null,
    weekly: null,
    updatedAt: 0,
    error: null,
    status: 'unavailable'
  }
}

/**
 * Settles empty provider slots into the `unavailable` status while usage polling is disabled.
 *
 * Why: no fetch cycle runs under the policy, and the status bar turns a null snapshot into a
 * permanently animating "fetching" chip for every configured provider.
 */
export function settleUsagePollingDisabledProviders(
  slots: UsageProviderSlots,
  isUsagePollingDisabled: boolean
): UsageProviderSlots {
  if (!isUsagePollingDisabled) {
    return slots
  }
  const settled = { ...slots }
  for (const slot of Object.keys(PROVIDER_BY_SLOT) as (keyof UsageProviderSlots)[]) {
    // Why: Claude statusline ingest still lands under the policy, so only fill slots that have no data.
    settled[slot] = settled[slot] ?? unavailableSnapshot(PROVIDER_BY_SLOT[slot])
  }
  return settled
}

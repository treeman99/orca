import type { ProviderRateLimits } from './rate-limit-types'

// Maps a usage-meter provider to the TuiAgent id the enterprise allowlist gates on,
// so the status bar and the main-process poller agree on what to show and fetch.
//
// 'minimax' has no TuiAgent, so it maps to itself: absent from any allowlist, it is
// hidden under a Bedrock-only policy, which is the intended behavior. 'opencode-go' is
// the usage label for the 'opencode' agent.
export function usageProviderAgentId(provider: ProviderRateLimits['provider']): string {
  return provider === 'opencode-go' ? 'opencode' : provider
}

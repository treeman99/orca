import { useAppStore } from '../../store'
import type { StatusBarItem } from '../../../../shared/ui-chrome-types'
import { isStatusBarItemAvailable } from './status-bar-agent-gating'
import { useEnterprisePolicyView } from '@/enterprise/enterprise-policy-access'

/** Subscribes to detected-agent state and returns the toggles filtered to
 *  those whose underlying CLI is installed (or pre-detection). */
export function useAvailableStatusBarToggles<T extends { id: StatusBarItem }>(
  toggles: readonly T[]
): T[] {
  const detectedAgentIds = useAppStore((s) => s.detectedAgentIds)
  // Why the third argument: this caller used to omit it, so Settings → Appearance still
  // offered "Codex Usage" / "Gemini Usage" toggles on a Bedrock-only policy even though
  // the meters themselves were already hidden.
  const { allowedAgents } = useEnterprisePolicyView()
  return toggles.filter((t) => isStatusBarItemAvailable(t.id, detectedAgentIds, allowedAgents))
}

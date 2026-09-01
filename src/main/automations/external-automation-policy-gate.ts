import type { ExternalAutomationProvider } from '../../shared/automations-types'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'
import { isAgentAllowedByPolicy } from '../../shared/corporate-agent-access'

/**
 * May this external automation provider be used at all?
 *
 * Two policy axes converge here. `disableExternalAutomations` is the wholesale switch:
 * these providers spawn a vendor CLI on a schedule with nobody at the keyboard, which is
 * the last thing a bare `"lockdown": true` should leave running. `allowedAgents` covers it
 * too, because the "provider" IS an agent CLI id — `execFile('hermes', ['cron', …])` —
 * so a fleet that already narrowed its agents does not have to say it twice.
 *
 * Gated in main, not in the renderer: a renderer-only gate would still let main probe PATH,
 * read ~/.hermes, and spawn the CLI, and a manager that slipped through would be relabeled
 * with the sibling provider's name.
 */
export function isExternalAutomationProviderAllowed(provider: ExternalAutomationProvider): boolean {
  const policy = getEnterprisePolicy()
  return (
    !policy.disableExternalAutomations && isAgentAllowedByPolicy(provider, policy.allowedAgents)
  )
}

export function assertExternalAutomationProviderAllowed(
  provider: ExternalAutomationProvider
): void {
  if (!isExternalAutomationProviderAllowed(provider)) {
    throw new Error(`External automations for "${provider}" are disabled by an enterprise policy.`)
  }
}

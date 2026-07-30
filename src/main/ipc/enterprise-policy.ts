// IPC surface for the renderer-visible slice of the corporate policy.
//
//   enterprisePolicy:get — the switches the UI hides surfaces on, and the lockdown flag.
//
// The policy is administrator-owned and read-only to the renderer; nothing here
// writes. Only the fields the UI gates on cross the boundary (see EnterprisePolicyView).

import { ipcMain } from 'electron'
import type { EnterprisePolicyView } from '../../shared/enterprise-policy-view'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'

// Naming the keys once keeps the projection honest: a field added to the view fails to
// compile here until it is deliberately sourced from the policy.
const VIEW_KEYS = [
  'allowedAgents',
  'lockdown',
  'disableAutoUpdate',
  'disableMobilePairing',
  'disableMobileEmulator',
  'disableExternalAutomations',
  'disableAgentInstallSuggestions',
  'disableUsagePolling',
  'disableVendorProviderAccounts',
  'disableRemoteOrcaServer',
  'disableVoice',
  'disablePlugins',
  'requireComputerUseApproval'
] as const satisfies readonly (keyof EnterprisePolicyView)[]

type ViewKey = (typeof VIEW_KEYS)[number]
type PolicySource = () => Pick<ReturnType<typeof getEnterprisePolicy>, ViewKey>

function projectPolicyView(
  policy: Pick<ReturnType<typeof getEnterprisePolicy>, ViewKey>
): EnterprisePolicyView {
  return {
    allowedAgents: policy.allowedAgents,
    lockdown: policy.lockdown,
    disableAutoUpdate: policy.disableAutoUpdate,
    disableMobilePairing: policy.disableMobilePairing,
    disableMobileEmulator: policy.disableMobileEmulator,
    disableExternalAutomations: policy.disableExternalAutomations,
    disableAgentInstallSuggestions: policy.disableAgentInstallSuggestions,
    disableUsagePolling: policy.disableUsagePolling,
    disableVendorProviderAccounts: policy.disableVendorProviderAccounts,
    disableRemoteOrcaServer: policy.disableRemoteOrcaServer,
    disableVoice: policy.disableVoice,
    disablePlugins: policy.disablePlugins,
    requireComputerUseApproval: policy.requireComputerUseApproval
  }
}

export function registerEnterprisePolicyHandlers(
  getPolicy: PolicySource = getEnterprisePolicy
): void {
  ipcMain.handle('enterprisePolicy:get', (): EnterprisePolicyView => projectPolicyView(getPolicy()))

  // Why a synchronous channel too: the renderer gates are read from module-scope
  // constants and from builders memoized on first call, so a policy that arrives one
  // async tick later leaves those frozen at "unrestricted" for the process lifetime —
  // a gate that passes its tests and changes nothing. Precedent: settings:get-sync.
  ipcMain.on('enterprisePolicy:get-sync', (event) => {
    event.returnValue = projectPolicyView(getPolicy())
  })
}

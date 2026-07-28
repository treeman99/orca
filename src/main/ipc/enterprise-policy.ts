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
  'disableVendorProviderAccounts',
  'disableRemoteOrcaServer',
  'disableVoice',
  'requireComputerUseApproval'
] as const satisfies readonly (keyof EnterprisePolicyView)[]

type ViewKey = (typeof VIEW_KEYS)[number]
type PolicySource = () => Pick<ReturnType<typeof getEnterprisePolicy>, ViewKey>

export function registerEnterprisePolicyHandlers(
  getPolicy: PolicySource = getEnterprisePolicy
): void {
  ipcMain.handle('enterprisePolicy:get', (): EnterprisePolicyView => {
    const policy = getPolicy()
    return {
      allowedAgents: policy.allowedAgents,
      lockdown: policy.lockdown,
      disableAutoUpdate: policy.disableAutoUpdate,
      disableMobilePairing: policy.disableMobilePairing,
      disableVendorProviderAccounts: policy.disableVendorProviderAccounts,
      disableRemoteOrcaServer: policy.disableRemoteOrcaServer,
      disableVoice: policy.disableVoice,
      requireComputerUseApproval: policy.requireComputerUseApproval
    }
  })
}

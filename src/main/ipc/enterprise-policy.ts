// IPC surface for the renderer-visible slice of the corporate policy.
//
//   enterprisePolicy:get — the allowed-agents restriction and the lockdown flag.
//
// The policy is administrator-owned and read-only to the renderer; nothing here
// writes. Only the fields the UI gates on cross the boundary (see EnterprisePolicyView).

import { ipcMain } from 'electron'
import type { EnterprisePolicyView } from '../../shared/enterprise-policy-view'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'

type PolicySource = () => Pick<ReturnType<typeof getEnterprisePolicy>, 'allowedAgents' | 'lockdown'>

export function registerEnterprisePolicyHandlers(
  getPolicy: PolicySource = getEnterprisePolicy
): void {
  ipcMain.handle('enterprisePolicy:get', (): EnterprisePolicyView => {
    const policy = getPolicy()
    return { allowedAgents: policy.allowedAgents, lockdown: policy.lockdown }
  })
}

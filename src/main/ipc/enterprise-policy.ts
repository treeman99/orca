// IPC surface for the renderer-visible slice of the corporate policy.
//
//   enterprisePolicy:get — the switches the UI hides surfaces on, and the lockdown flag.
//
// The policy is administrator-owned and read-only to the renderer; nothing here
// writes. Only the fields the UI gates on cross the boundary (see EnterprisePolicyView).

import { ipcMain } from 'electron'
import {
  toEnterprisePolicyView,
  type EnterprisePolicyView
} from '../../shared/enterprise-policy-view'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'

type PolicySource = () => Parameters<typeof toEnterprisePolicyView>[0]

export function registerEnterprisePolicyHandlers(
  getPolicy: PolicySource = getEnterprisePolicy
): void {
  ipcMain.handle(
    'enterprisePolicy:get',
    (): EnterprisePolicyView => toEnterprisePolicyView(getPolicy())
  )

  // Why a synchronous channel too: the renderer gates are read from module-scope
  // constants and from builders memoized on first call, so a policy that arrives one
  // async tick later leaves those frozen at "unrestricted" for the process lifetime —
  // a gate that passes its tests and changes nothing. Precedent: settings:get-sync.
  ipcMain.on('enterprisePolicy:get-sync', (event) => {
    event.returnValue = toEnterprisePolicyView(getPolicy())
  })
}

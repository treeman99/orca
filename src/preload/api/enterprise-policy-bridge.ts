import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type { EnterprisePolicyView } from '../../shared/enterprise-policy-view'

export const enterprisePolicyApi = {
  get: (): Promise<EnterprisePolicyView> => ipcRenderer.invoke('enterprisePolicy:get'),
  getSync: (): EnterprisePolicyView | null =>
    ipcRenderer.sendSync('enterprisePolicy:get-sync') as EnterprisePolicyView | null
} satisfies PreloadApi['enterprisePolicy']

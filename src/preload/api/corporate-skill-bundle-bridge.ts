import { ipcRenderer } from 'electron'
import type { CorporateSkillBundleApi } from './app-update-api'
import {
  CORPORATE_SKILL_BUNDLE_STATUS_EVENT,
  type CorporateSkillBundleStatus,
  type CorporateSkillBundleUpdateResult
} from '../../shared/corporate-skill-bundle'

export const corporateSkillBundleApi = {
  getStatus: (): Promise<CorporateSkillBundleStatus> =>
    ipcRenderer.invoke('corporateSkillBundle:getStatus'),
  check: (): Promise<CorporateSkillBundleStatus> =>
    ipcRenderer.invoke('corporateSkillBundle:check'),
  update: (): Promise<CorporateSkillBundleUpdateResult> =>
    ipcRenderer.invoke('corporateSkillBundle:update'),
  dismiss: (args: { commitSha: string }): Promise<CorporateSkillBundleStatus> =>
    ipcRenderer.invoke('corporateSkillBundle:dismiss', args),
  onStatus: (callback: (status: CorporateSkillBundleStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: CorporateSkillBundleStatus) =>
      callback(status)
    ipcRenderer.on(CORPORATE_SKILL_BUNDLE_STATUS_EVENT, listener)
    return () => ipcRenderer.removeListener(CORPORATE_SKILL_BUNDLE_STATUS_EVENT, listener)
  }
} satisfies CorporateSkillBundleApi

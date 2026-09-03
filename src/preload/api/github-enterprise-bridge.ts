import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type {
  GithubEnterpriseAuthStatus,
  GithubEnterpriseLoginProgress,
  GithubEnterpriseLoginResult
} from '../../shared/github-enterprise-auth'

export const githubEnterpriseApi = {
  getStatus: (): Promise<GithubEnterpriseAuthStatus> =>
    ipcRenderer.invoke('githubEnterprise:getStatus'),
  setHost: (args: { host: string }): Promise<GithubEnterpriseAuthStatus> =>
    ipcRenderer.invoke('githubEnterprise:setHost', args),
  login: (args: { host: string }): Promise<GithubEnterpriseLoginResult> =>
    ipcRenderer.invoke('githubEnterprise:login', args),
  loginWithToken: (args: { host: string; token: string }): Promise<GithubEnterpriseLoginResult> =>
    ipcRenderer.invoke('githubEnterprise:loginWithToken', args),
  logout: (args: { host: string }): Promise<void> =>
    ipcRenderer.invoke('githubEnterprise:logout', args),
  onLoginProgress: (callback: (progress: GithubEnterpriseLoginProgress) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: GithubEnterpriseLoginProgress
    ) => callback(progress)
    ipcRenderer.on('githubEnterprise:loginProgress', listener)
    return () => ipcRenderer.removeListener('githubEnterprise:loginProgress', listener)
  }
} satisfies PreloadApi['githubEnterprise']

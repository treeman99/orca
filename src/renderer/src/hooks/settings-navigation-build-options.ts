import type { Repo } from '../../../shared/repo-types'
import type { EnterprisePolicyView } from '../../../shared/enterprise-policy-view'

export type SettingsNavigationBuildOptions = {
  isMac: boolean
  isWindows: boolean
  isLocalWindowsHost: boolean
  isWindowsTerminalHost: boolean
  isWebClient: boolean
  managedBrowserCreationEnabled: boolean
  mobileEmulatorCreationEnabled: boolean
  isDev: boolean
  isLinearConnected: boolean
  // Corporate policy narrows the sidebar the same way the web client does: a pane the policy
  // removed must not be reachable from Cmd+J either, which is why this registry — the one both
  // surfaces read — is where the switches land. Passed in rather than read here so the hook can
  // subscribe to it and re-render on the startup fetch.
  policy: EnterprisePolicyView
  repos: readonly Repo[]
}

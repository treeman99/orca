// The slice of the enterprise policy the renderer is allowed to see, sent over the
// `enterprisePolicy:get` IPC. Deliberately tiny: only what the UI needs to gate the
// provider surfaces. Secrets and file paths never cross this boundary.
//
// Every flag here is a *display* decision. The real block always lives in main — a
// renderer that never received this object (the web client does not expose the IPC)
// must not thereby unlock anything.

export type EnterprisePolicyView = {
  /** Agent ids the UI may offer, or null for no restriction (upstream behavior). */
  allowedAgents: readonly string[] | null
  /** Master corporate lockdown switch, for surfaces that key off it directly. */
  lockdown: boolean
  /** Hide every update affordance: menu items, settings rows, the update card. */
  disableAutoUpdate: boolean
  /** Hide the Mobile pane, its sidebar entry, and the pairing QR. */
  disableMobilePairing: boolean
  /** Hide the vendor account sections in Settings → AI provider accounts. */
  disableVendorProviderAccounts: boolean
  /** Hide Settings → Runtime Environments and the remote pickers that feed it. */
  disableRemoteOrcaServer: boolean
  /** Hide the Voice pane, the composer microphone, and the dictation shortcut. */
  disableVoice: boolean
  /** Computer Use must confirm with the user before it changes anything. */
  requireComputerUseApproval: boolean
}

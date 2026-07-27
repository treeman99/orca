// The slice of the enterprise policy the renderer is allowed to see, sent over the
// `enterprisePolicy:get` IPC. Deliberately tiny: only what the UI needs to gate the
// provider surfaces. Secrets and file paths never cross this boundary.

export type EnterprisePolicyView = {
  /** Agent ids the UI may offer, or null for no restriction (upstream behavior). */
  allowedAgents: readonly string[] | null
  /** Master corporate lockdown switch, for surfaces that key off it directly. */
  lockdown: boolean
}

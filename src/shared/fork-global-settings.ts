// Fork-owned GlobalSettings fields, kept out of global-settings-types.ts so that upstream file
// stays inside max-lines as upstream grows it (README §6). Intersected into GlobalSettings there.
export type ForkGlobalSettings = {
  /** Opt-in: orchestration workers started in the coordinator's own worktree open in a split column beside it instead of as tabs in the active group. */
  autoSplitOrchestrationWorkerPanes?: boolean
  /** How tall that worker column may grow before workers share panes as tabs; clamped on read, so an out-of-range value degrades instead of breaking the layout. */
  orchestrationMaxWorkerPanes?: number
  /** On by default: release a worker's terminal — closing its tab and pane — as soon as its own worker_done settles, instead of waiting for the coordinator's worker-release. */
  autoCloseCompletedOrchestrationWorkerTabs?: boolean
  /** Opt-in plain-text troubleshooting log. Off by default: it is a support aid, not telemetry — nothing leaves the machine. */
  diagnosticLogEnabled?: boolean
  /** Folder for that log. Empty falls back to the app's own logs directory. */
  diagnosticLogDirectory?: string
  /**
   * Self-hosted Confluence (Server / Data Center) base URL, e.g.
   * `https://confluence-mirror.samsungds.net`. Empty means not configured.
   *
   * Fork-only. Atlassian Cloud is deliberately not an option: this fleet's wiki is a
   * self-hosted mirror, and Cloud would need a different API path and a different auth
   * header — offering both would be two code paths for a host nobody here uses.
   */
  confluenceBaseUrl?: string
  /** Confluence personal access token, sent as `Authorization: Bearer`. Encrypted at rest. */
  confluenceApiToken?: string
  /**
   * Username for Basic auth. Empty means the token is a Personal Access Token sent as
   * `Authorization: Bearer`.
   *
   * Why both schemes: PATs only exist on Confluence Server/DC 7.9+. An older mirror — and a
   * deployment with PATs turned off — takes username + password over Basic, which is exactly
   * what those servers advertise in the 401 challenge.
   */
  confluenceUsername?: string
}

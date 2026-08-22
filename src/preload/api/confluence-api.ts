import type { ConfluenceConnectionTestResult } from '../../shared/confluence-connection'

export type ConfluenceApi = {
  /** Verify the stored credential, or the draft one the pane is about to save. */
  testConnection: (args?: {
    baseUrl?: string
    token?: string
  }) => Promise<ConfluenceConnectionTestResult>
}

import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import {
  testConfluenceConnection,
  type ConfluenceConnectionTestResult
} from '../confluence/confluence-connection-test'

export function registerConfluenceHandlers(store: Store): void {
  ipcMain.handle(
    'confluence:testConnection',
    // The token comes from the store, not the renderer: the pane never holds the saved
    // credential, and a renderer-supplied one would let any renderer bug exfiltrate it by
    // pointing the test at another host.
    async (
      _event,
      args?: { baseUrl?: string; token?: string }
    ): Promise<ConfluenceConnectionTestResult> => {
      const settings = store.getSettings()
      return await testConfluenceConnection({
        baseUrl: args?.baseUrl?.trim() || (settings.confluenceBaseUrl ?? ''),
        token: args?.token?.trim() || (settings.confluenceApiToken ?? '')
      })
    }
  )
}

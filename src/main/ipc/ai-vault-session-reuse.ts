import { ipcMain } from 'electron'
import { markAiVaultSessionReused } from '../ai-vault-search/session-search-reuse-request'

// Fork: reuse restarts session search retention; see ai-vault-search/session-search-reuse.ts.
export function registerAiVaultSessionReuseHandler(): void {
  ipcMain.handle('aiVault:markSessionReused', (_event, args: unknown) =>
    markAiVaultSessionReused(args)
  )
}

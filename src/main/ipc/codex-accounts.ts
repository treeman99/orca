import { ipcMain } from 'electron'
import type { CodexAccountAddTarget, CodexAccountService } from '../codex-accounts/service'
import type { CodexAccountSelectionTarget } from '../codex-accounts/runtime-selection'
import { assertVendorAccountRegistrationAllowed } from '../enterprise/vendor-account-registration-guard'

export function registerCodexAccountHandlers(codexAccounts: CodexAccountService): void {
  ipcMain.handle('codexAccounts:list', () => codexAccounts.listAccounts())
  ipcMain.handle('codexAccounts:add', (_event, args?: CodexAccountAddTarget) => {
    assertVendorAccountRegistrationAllowed()
    return codexAccounts.addAccount(args)
  })
  ipcMain.handle('codexAccounts:reauthenticate', (_event, args: { accountId: string }) => {
    assertVendorAccountRegistrationAllowed()
    return codexAccounts.reauthenticateAccount(args.accountId)
  })
  ipcMain.handle('codexAccounts:remove', (_event, args: { accountId: string }) =>
    codexAccounts.removeAccount(args.accountId)
  )
  ipcMain.handle(
    'codexAccounts:select',
    (_event, args: { accountId: string | null } & CodexAccountSelectionTarget) => {
      if (!args.runtime) {
        // Why: older renderer surfaces selected by account id only. Let the
        // service infer the account's runtime instead of treating missing
        // runtime as Windows/host and rejecting valid WSL accounts.
        return codexAccounts.selectAccount(args.accountId)
      }
      return codexAccounts.selectAccountForTarget(args.accountId, args)
    }
  )
}

import { app, ipcMain } from 'electron'

// Fork-owned: upstream serves the app version through the updater IPC, which this build removed.
// Kept out of ipc/app.ts so that file stays under its max-lines cap as upstream grows it.
export function registerAppVersionHandler(): void {
  ipcMain.handle('app:getVersion', (): string => app.getVersion())
}

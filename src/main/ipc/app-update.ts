// IPC for the enterprise update-availability lane. Four channels plus one push:
//
//   appUpdate:getStatus      — the last known status (never triggers a lookup).
//   appUpdate:check          — check now; resolves with the fresh status.
//   appUpdate:dismissVersion — "don't tell me about this release again".
//   appUpdate:openReleasePage— hand the corporate release page to the OS browser.
//   appUpdate:status (event) — pushed when a scheduled check changes the status.
//
// The policy gate lives in the service, not here, so the scheduler and this surface
// cannot disagree about whether the lane is on.

import { ipcMain } from 'electron'
import { getAppUpdateCheckService } from '../app-update/app-update-check-service'
import type { AppUpdateCheckStatus } from '../../shared/app-update-check'
import { openExternalUrlUnderPolicy } from './shell-open-url'

function readVersionArg(raw: unknown): string {
  const args = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
  return typeof args?.version === 'string' ? args.version : ''
}

export function registerAppUpdateHandlers(): void {
  const service = getAppUpdateCheckService()

  ipcMain.handle('appUpdate:getStatus', (): AppUpdateCheckStatus => service.getStatus())
  ipcMain.handle('appUpdate:check', (): Promise<AppUpdateCheckStatus> => service.check())
  ipcMain.handle(
    'appUpdate:dismissVersion',
    (_event, raw: unknown): AppUpdateCheckStatus => service.dismissVersion(readVersionArg(raw))
  )
  // Why the status and not an argument: a renderer-supplied URL would make this a
  // general "open anything" channel; the only page this lane may open is the one
  // main resolved from the corporate host.
  ipcMain.handle('appUpdate:openReleasePage', async (): Promise<void> => {
    const status = service.getStatus()
    if (status.state === 'available') {
      await openExternalUrlUnderPolicy(status.releaseUrl)
    }
  })

  service.start()
}

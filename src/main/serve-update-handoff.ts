import { resolve } from 'node:path'
import { BROWSER_SIDECAR_OWNER_ENV } from '../shared/browser-sidecar-lifetime'
import { app } from 'electron'
import { quitProcess } from './startup/process-quit-request'
import {
  SERVE_UPDATE_HANDOFF_PATH_ENV,
  getServeUpdateHandoffPath,
  type ServeSupervisorMessage
} from '../shared/serve-update-handoff'
import { getCanonicalUserDataPath } from './persistence'

// Fork: the app updater is gone, so main never writes an install-requested
// handoff. What survives is the supervisor handshake — the CLI parent still
// wraps `orca serve`, and this module tells it we are ready and quits with it.

function getConfiguredHandoffPath(): string | null {
  const configuredPath = process.env[SERVE_UPDATE_HANDOFF_PATH_ENV]
  if (!configuredPath) {
    return null
  }
  const expectedPath = getServeUpdateHandoffPath(getCanonicalUserDataPath())
  return resolve(configuredPath) === resolve(expectedPath) ? expectedPath : null
}

function hasServeUpdateSupervisor(): boolean {
  return process.platform === 'darwin' && getConfiguredHandoffPath() !== null
}

export function notifyServeSupervisorReady(runtimeId: string): void {
  if (!process.send || process.connected === false) {
    return
  }
  const message: ServeSupervisorMessage = {
    type: 'orca:serve-ready',
    version: app.getVersion(),
    runtimeId
  }
  try {
    process.send(message)
  } catch {
    // The disconnect listener owns parent-loss recovery; readiness reporting must not throw through startup.
  }
}

export function installServeSupervisorDisconnectQuit(
  isServeMode: boolean,
  parent: {
    connected?: boolean
    once(event: 'disconnect', listener: () => void): unknown
    off(event: 'disconnect', listener: () => void): unknown
  } = process
): () => void {
  const isBrowserSidecar = process.env[BROWSER_SIDECAR_OWNER_ENV] === '1'
  delete process.env[BROWSER_SIDECAR_OWNER_ENV]
  if (!isServeMode || (!isBrowserSidecar && !hasServeUpdateSupervisor())) {
    return () => undefined
  }
  const quit = (): void => quitProcess()
  parent.once('disconnect', quit)
  if (isBrowserSidecar && parent.connected !== true) {
    quit()
  }
  return () => parent.off('disconnect', quit)
}

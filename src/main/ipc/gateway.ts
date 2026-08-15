// IPC surface for the corporate gateway sign-in the Settings UI drives. Three channels:
//
//   gateway:getStatus   — whether `gateway-cli` is on PATH, plus what `gateway-cli verify`
//                         reports about the current session.
//   gateway:login       — run `gateway-cli login`, streaming the user code and authorization
//                         URL on gateway:loginProgress; resolves on exit.
//   gateway:cancelLogin — abort the login that is in flight, if any.
//
// The gateway CLI owns the credential: it provisions the virtual key itself, so nothing here
// reads, stores, or injects one. `login` takes no arguments — there is no profile to pick,
// so the renderer has nothing it could hand to a spawned process. No logout channel: whether
// `gateway-cli` has that subcommand is unconfirmed.

import { ipcMain, type WebContents } from 'electron'
import type {
  GatewayLoginProgress,
  GatewayLoginResult,
  GatewayStatus
} from '../../shared/gateway-auth'
import { detectGatewayCli, type GatewayCliAvailability } from '../gateway/gateway-cli-availability'
import { runGatewayVerify, type GatewayVerification } from '../gateway/gateway-verify'
import { runGatewayLogin } from '../gateway/gateway-login'

export type GatewayDependencies = {
  available: () => Promise<GatewayCliAvailability>
  verify: () => Promise<GatewayVerification>
  login: typeof runGatewayLogin
}

// Only one sign-in can be in flight; a new one aborts the previous.
let activeLogin: AbortController | null = null

function defaultDependencies(): GatewayDependencies {
  return {
    available: detectGatewayCli,
    verify: runGatewayVerify,
    login: runGatewayLogin
  }
}

async function getStatus(dependencies: GatewayDependencies): Promise<GatewayStatus> {
  const availability = await dependencies.available()
  // Without the CLI there is nothing to ask about the session.
  if (!availability.available) {
    return {
      gatewayAvailable: false,
      version: null,
      signedIn: false,
      expiresAt: null,
      identity: null,
      detail: null
    }
  }
  const verification = await dependencies.verify()
  return { gatewayAvailable: true, version: availability.version, ...verification }
}

async function login(
  sender: WebContents,
  dependencies: GatewayDependencies
): Promise<GatewayLoginResult> {
  activeLogin?.abort()
  const controller = new AbortController()
  activeLogin = controller

  const result = await dependencies.login({
    signal: controller.signal,
    onProgress: (progress: GatewayLoginProgress) => {
      if (!sender.isDestroyed()) {
        sender.send('gateway:loginProgress', progress)
      }
    }
  })

  // Only clear the slot we own; a newer login has already claimed it otherwise.
  if (activeLogin === controller) {
    activeLogin = null
  }
  return result
}

export function registerGatewayHandlers(
  dependencies: GatewayDependencies = defaultDependencies()
): void {
  ipcMain.handle('gateway:getStatus', (): Promise<GatewayStatus> => getStatus(dependencies))

  ipcMain.handle(
    'gateway:login',
    (event): Promise<GatewayLoginResult> => login(event.sender, dependencies)
  )

  ipcMain.handle('gateway:cancelLogin', (): void => {
    activeLogin?.abort()
  })
}

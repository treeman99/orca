import { ipcMain } from 'electron'
import {
  clearMiniMaxSessionCookie,
  hasMiniMaxSessionCookie,
  saveMiniMaxSessionCookie
} from '../minimax/minimax-cookie-store'
import {
  clearMiniMaxApiKey,
  hasMiniMaxApiKey,
  saveMiniMaxApiKey
} from '../minimax/minimax-api-key-store'
import { clearMiniMaxSessionCookieJar } from '../rate-limits/minimax/minimax-request-context'
import { assertVendorAccountRegistrationAllowed } from '../enterprise/vendor-account-registration-guard'
import type { RateLimitService } from '../rate-limits/service'

export type MiniMaxCredentialsStatus = {
  configured: boolean
  cookieConfigured: boolean
  apiKeyConfigured: boolean
}

function getMiniMaxCredentialsStatus(): MiniMaxCredentialsStatus {
  const cookieConfigured = hasMiniMaxSessionCookie()
  const apiKeyConfigured = hasMiniMaxApiKey()
  return {
    configured: cookieConfigured || apiKeyConfigured,
    cookieConfigured,
    apiKeyConfigured
  }
}

// Why: fire-and-forget — callers get the persisted credential status immediately;
// the rate-limit refresh runs in the background and only logs on failure.
function refreshAfterMiniMaxCredentialChange(
  rateLimits: RateLimitService | null,
  action: 'save' | 'clear'
): void {
  rateLimits?.invalidateMiniMaxCredentialState()
  void rateLimits?.refresh().catch((error: unknown) => {
    console.error(`[minimax] failed to trigger rate-limit refresh after ${action}:`, error)
  })
}

export function registerMiniMaxCredentialsHandlers(rateLimits: RateLimitService | null): void {
  ipcMain.handle('minimaxCredentials:getStatus', () => getMiniMaxCredentialsStatus())
  ipcMain.handle('minimaxCredentials:saveCookie', (_event, cookie: string) => {
    assertVendorAccountRegistrationAllowed()
    // Validate the IPC argument in the main process; the renderer-declared type
    // is compile-time only and the value arrives as unknown over IPC.
    if (typeof cookie !== 'string') {
      throw new Error('MiniMax session cookie must be a string')
    }
    saveMiniMaxSessionCookie(cookie)
    refreshAfterMiniMaxCredentialChange(rateLimits, 'save')
    return getMiniMaxCredentialsStatus()
  })
  ipcMain.handle('minimaxCredentials:clearCookie', async () => {
    clearMiniMaxSessionCookie()
    try {
      await clearMiniMaxSessionCookieJar()
    } catch (error) {
      console.error('[minimax] failed to clear session cookie jar after credential clear:', error)
    }
    refreshAfterMiniMaxCredentialChange(rateLimits, 'clear')
    return getMiniMaxCredentialsStatus()
  })
  ipcMain.handle('minimaxCredentials:saveApiKey', (_event, key: string) => {
    // Why here too: an API key is a second vendor-account registration lane, added upstream after
    // the cookie one was gated. Same switch, same refusal.
    assertVendorAccountRegistrationAllowed()
    if (typeof key !== 'string') {
      throw new Error('MiniMax API key must be a string')
    }
    saveMiniMaxApiKey(key)
    refreshAfterMiniMaxCredentialChange(rateLimits, 'save')
    return getMiniMaxCredentialsStatus()
  })
  ipcMain.handle('minimaxCredentials:clearApiKey', () => {
    clearMiniMaxApiKey()
    refreshAfterMiniMaxCredentialChange(rateLimits, 'clear')
    return getMiniMaxCredentialsStatus()
  })
}

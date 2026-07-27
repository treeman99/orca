// IPC surface for the company's self-hosted model endpoints. Channels:
//
//   corporateLlmEndpoints:list             — provisioned + user-added endpoints, each
//                                            with whether a token is saved and whether
//                                            the user added it.
//   corporateLlmEndpoints:saveToken        — store this user's token for one endpoint.
//   corporateLlmEndpoints:clearToken       — forget it again.
//   corporateLlmEndpoints:addUserEndpoint  — add a self-hosted endpoint (URL + protocol).
//   corporateLlmEndpoints:removeUserEndpoint — remove a user-added endpoint (+ its token).
//
// The token crosses this boundary in one direction only. `list` reports a boolean,
// never the secret, so a compromised renderer has nothing to exfiltrate; the
// selection that reaches a launch is the endpoint id alone
// (src/main/enterprise/corporate-llm-launch-injection.ts).
//
// The renderer is in the threat model, so every argument is narrowed here. A user may
// add or remove their own endpoints; policy-provisioned endpoints are read-only and a
// token may be written only for an endpoint that actually exists.

import { ipcMain } from 'electron'
import type {
  CorporateLlmAddEndpointResult,
  CorporateLlmEndpointStatus,
  CorporateLlmTokenSaveResult
} from '../../shared/corporate-llm-endpoint-status'
import type { EnterpriseLlmEndpoint } from '../../shared/enterprise-llm-endpoints'
import {
  hasCorporateLlmToken,
  writeCorporateLlmToken,
  type CorporateLlmTokenWriteResult
} from '../enterprise/corporate-llm-token-store'
import { getAllCorporateLlmEndpoints } from '../enterprise/corporate-llm-endpoint-registry'
import {
  addUserCorporateLlmEndpoint,
  isUserCorporateLlmEndpoint,
  removeUserCorporateLlmEndpoint,
  type AddUserEndpointResult
} from '../enterprise/corporate-llm-user-endpoints'

// A bearer token, not a document: anything longer is a paste accident or an
// attempt to grow the user's profile directory through the IPC surface.
const MAX_TOKEN_LENGTH = 8192

type Dependencies = {
  allEndpoints: () => readonly EnterpriseLlmEndpoint[]
  isUserEndpoint: (endpointId: string) => boolean
  hasToken: (endpointId: string) => boolean
  writeToken: (endpointId: string, token: string) => CorporateLlmTokenWriteResult
  addUserEndpoint: (input: unknown) => AddUserEndpointResult
  removeUserEndpoint: (endpointId: string) => void
}

function defaultDependencies(): Dependencies {
  return {
    allEndpoints: getAllCorporateLlmEndpoints,
    isUserEndpoint: isUserCorporateLlmEndpoint,
    hasToken: hasCorporateLlmToken,
    writeToken: writeCorporateLlmToken,
    addUserEndpoint: addUserCorporateLlmEndpoint,
    removeUserEndpoint: removeUserCorporateLlmEndpoint
  }
}

function readEndpointId(raw: unknown): string {
  const args = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
  const endpointId = typeof args?.endpointId === 'string' ? args.endpointId.trim() : ''
  if (!endpointId) {
    throw new Error('endpointId must be a non-empty string')
  }
  return endpointId
}

function readToken(raw: unknown): string {
  const args = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
  if (typeof args?.token !== 'string') {
    throw new Error('token must be a string')
  }
  if (args.token.length > MAX_TOKEN_LENGTH) {
    throw new Error('token is too long')
  }
  return args.token
}

function toStatus(
  endpoint: EnterpriseLlmEndpoint,
  dependencies: Dependencies
): CorporateLlmEndpointStatus {
  return {
    ...endpoint,
    hasToken: dependencies.hasToken(endpoint.id),
    userManaged: dependencies.isUserEndpoint(endpoint.id)
  }
}

function listEndpointStatuses(dependencies: Dependencies): CorporateLlmEndpointStatus[] {
  return dependencies.allEndpoints().map((endpoint) => toStatus(endpoint, dependencies))
}

/** Save, or with an empty token clear, after proving the endpoint actually exists. */
function storeToken(
  endpointId: string,
  token: string,
  dependencies: Dependencies
): CorporateLlmTokenSaveResult {
  if (!dependencies.allEndpoints().some((endpoint) => endpoint.id === endpointId)) {
    return { ok: false, reason: 'unknown-endpoint' }
  }
  const result = dependencies.writeToken(endpointId, token)
  if (result.ok) {
    return { ok: true, hasToken: dependencies.hasToken(endpointId) }
  }
  // The id passed the existence check, so 'unsupported-id' can only mean the id is
  // not usable as a file name — from the renderer's side it simply cannot hold a token.
  return {
    ok: false,
    reason: result.reason === 'unsupported-id' ? 'unknown-endpoint' : result.reason
  }
}

function addEndpoint(raw: unknown, dependencies: Dependencies): CorporateLlmAddEndpointResult {
  const result = dependencies.addUserEndpoint(raw)
  if (!result.ok) {
    return { ok: false, reason: 'invalid-endpoint', message: result.message }
  }
  // The endpoint was just added by the user, so it is user-managed by definition —
  // no need to round-trip through the store to learn that.
  return {
    ok: true,
    endpoint: {
      ...result.endpoint,
      hasToken: dependencies.hasToken(result.endpoint.id),
      userManaged: true
    }
  }
}

function removeEndpoint(endpointId: string, dependencies: Dependencies): void {
  // Only user-added endpoints are removable; an admin's policy endpoint is left intact.
  if (!dependencies.isUserEndpoint(endpointId)) {
    return
  }
  dependencies.removeUserEndpoint(endpointId)
  // Empty token clears the encrypted token file so a removed id leaves nothing behind.
  dependencies.writeToken(endpointId, '')
}

export function registerCorporateLlmEndpointHandlers(
  dependencies: Dependencies = defaultDependencies()
): void {
  ipcMain.handle('corporateLlmEndpoints:list', (): CorporateLlmEndpointStatus[] =>
    listEndpointStatuses(dependencies)
  )

  ipcMain.handle(
    'corporateLlmEndpoints:saveToken',
    (_event, args: unknown): CorporateLlmTokenSaveResult =>
      storeToken(readEndpointId(args), readToken(args), dependencies)
  )

  ipcMain.handle(
    'corporateLlmEndpoints:clearToken',
    (_event, args: unknown): CorporateLlmTokenSaveResult =>
      // The store treats an empty token as a clear.
      storeToken(readEndpointId(args), '', dependencies)
  )

  ipcMain.handle(
    'corporateLlmEndpoints:addUserEndpoint',
    (_event, args: unknown): CorporateLlmAddEndpointResult => addEndpoint(args, dependencies)
  )

  ipcMain.handle('corporateLlmEndpoints:removeUserEndpoint', (_event, args: unknown): void =>
    removeEndpoint(readEndpointId(args), dependencies)
  )
}

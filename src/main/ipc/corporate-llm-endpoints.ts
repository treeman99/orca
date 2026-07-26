// IPC surface for the company's self-hosted model endpoints. Three channels:
//
//   corporateLlmEndpoints:list       — provisioned endpoints + whether a token is saved.
//   corporateLlmEndpoints:saveToken  — store this user's token for one endpoint.
//   corporateLlmEndpoints:clearToken — forget it again.
//
// The token crosses this boundary in one direction only. `list` reports a boolean,
// never the secret, so a compromised renderer has nothing to exfiltrate; the
// selection that reaches a launch is the endpoint id alone
// (src/main/enterprise/corporate-llm-launch-injection.ts).
//
// The renderer is in the threat model, so every argument is narrowed here, and the
// endpoint id is checked against the policy file before anything is written — a
// token file must exist only for an endpoint an administrator provisioned.

import { ipcMain } from 'electron'
import type {
  CorporateLlmEndpointStatus,
  CorporateLlmTokenSaveResult
} from '../../shared/corporate-llm-endpoint-status'
import type { EnterpriseLlmEndpoint } from '../../shared/enterprise-llm-endpoints'
import {
  hasCorporateLlmToken,
  writeCorporateLlmToken,
  type CorporateLlmTokenWriteResult
} from '../enterprise/corporate-llm-token-store'
import { getEnterprisePolicy } from '../enterprise/enterprise-policy-file'

// A bearer token, not a document: anything longer is a paste accident or an
// attempt to grow the user's profile directory through the IPC surface.
const MAX_TOKEN_LENGTH = 8192

type Dependencies = {
  listEndpoints: () => readonly EnterpriseLlmEndpoint[]
  hasToken: (endpointId: string) => boolean
  writeToken: (endpointId: string, token: string) => CorporateLlmTokenWriteResult
}

function defaultDependencies(): Dependencies {
  return {
    listEndpoints: () => getEnterprisePolicy().llmEndpoints,
    hasToken: hasCorporateLlmToken,
    writeToken: writeCorporateLlmToken
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

function listEndpointStatuses(dependencies: Dependencies): CorporateLlmEndpointStatus[] {
  return dependencies.listEndpoints().map((endpoint) => ({
    ...endpoint,
    hasToken: dependencies.hasToken(endpoint.id)
  }))
}

/** Save, or with an empty token clear, after proving the policy provisioned the id. */
function storeToken(
  endpointId: string,
  token: string,
  dependencies: Dependencies
): CorporateLlmTokenSaveResult {
  if (!dependencies.listEndpoints().some((endpoint) => endpoint.id === endpointId)) {
    return { ok: false, reason: 'unknown-endpoint' }
  }
  const result = dependencies.writeToken(endpointId, token)
  if (result.ok) {
    return { ok: true, hasToken: dependencies.hasToken(endpointId) }
  }
  // The id passed the policy check, so 'unsupported-id' can only mean the
  // administrator wrote an id the token store cannot use as a file name — from
  // the renderer's side that endpoint simply cannot hold a token either way.
  return {
    ok: false,
    reason: result.reason === 'unsupported-id' ? 'unknown-endpoint' : result.reason
  }
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
}

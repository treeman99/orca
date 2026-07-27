// Self-hosted model endpoints a user adds from Settings, complementing the ones an
// administrator provisions in the policy file. Stored as plain JSON in the user's
// profile: the URL/label/api/model are not secrets — the per-endpoint token stays in
// the encrypted token store (corporate-llm-token-store.ts), keyed by the same id.
//
// The URL is https-validated before it is written (validateUserLlmEndpointInput), so a
// user cannot save a plain-http endpoint their token would later be sent to in clear.

import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  validateUserLlmEndpointInput,
  type EnterpriseLlmEndpoint
} from '../../shared/enterprise-llm-endpoints'

const FILE_NAME = 'corporate-llm-user-endpoints.json'

function storePath(): string | null {
  try {
    const userData = app?.getPath?.('userData')
    return userData ? path.join(userData, FILE_NAME) : null
  } catch {
    return null
  }
}

function isEndpoint(value: unknown): value is EnterpriseLlmEndpoint {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const entry = value as Record<string, unknown>
  return typeof entry.id === 'string' && typeof entry.baseUrl === 'string'
}

export function readUserCorporateLlmEndpoints(): EnterpriseLlmEndpoint[] {
  const filePath = storePath()
  if (!filePath || !existsSync(filePath)) {
    return []
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    return Array.isArray(parsed) ? parsed.filter(isEndpoint) : []
  } catch {
    return []
  }
}

function writeAll(endpoints: readonly EnterpriseLlmEndpoint[]): void {
  const filePath = storePath()
  if (!filePath) {
    return
  }
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(endpoints, null, 2)}\n`, 'utf8')
}

export type AddUserEndpointResult =
  | { ok: true; endpoint: EnterpriseLlmEndpoint }
  | { ok: false; message: string }

/** Validate and persist a new user endpoint, returning it with a generated id. */
export function addUserCorporateLlmEndpoint(input: unknown): AddUserEndpointResult {
  const validated = validateUserLlmEndpointInput(
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  )
  if (!validated.ok) {
    return { ok: false, message: validated.message }
  }
  // The id becomes a token-store filename, so keep it within its charset (uuid fits).
  const endpoint: EnterpriseLlmEndpoint = { id: `user-${randomUUID()}`, ...validated.value }
  writeAll([...readUserCorporateLlmEndpoints(), endpoint])
  return { ok: true, endpoint }
}

/** Remove a user endpoint by id. No-op for an unknown (e.g. policy-owned) id. */
export function removeUserCorporateLlmEndpoint(endpointId: string): void {
  const remaining = readUserCorporateLlmEndpoints().filter((endpoint) => endpoint.id !== endpointId)
  writeAll(remaining)
}

export function isUserCorporateLlmEndpoint(endpointId: string): boolean {
  return readUserCorporateLlmEndpoints().some((endpoint) => endpoint.id === endpointId)
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const state = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => {
      if (key === 'userData') {
        return state.userData
      }
      throw new Error(`unexpected getPath(${key})`)
    }
  }
}))

import {
  addUserCorporateLlmEndpoint,
  isUserCorporateLlmEndpoint,
  readUserCorporateLlmEndpoints,
  removeUserCorporateLlmEndpoint
} from './corporate-llm-user-endpoints'

describe('corporate LLM user endpoints', () => {
  beforeEach(() => {
    state.userData = mkdtempSync(join(tmpdir(), 'corp-llm-user-'))
  })
  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true })
  })

  it('starts empty', () => {
    expect(readUserCorporateLlmEndpoints()).toEqual([])
  })

  it('adds a validated endpoint with a token-store-safe id', () => {
    const result = addUserCorporateLlmEndpoint({ baseUrl: 'https://llm.mine/v1', api: 'openai' })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.endpoint.id).toMatch(/^[a-zA-Z0-9._-]{1,64}$/)
    expect(readUserCorporateLlmEndpoints()).toHaveLength(1)
    expect(isUserCorporateLlmEndpoint(result.endpoint.id)).toBe(true)
  })

  it('rejects a non-https endpoint without persisting it', () => {
    const result = addUserCorporateLlmEndpoint({ baseUrl: 'http://insecure' })
    expect(result.ok).toBe(false)
    expect(readUserCorporateLlmEndpoints()).toEqual([])
  })

  it('removes an endpoint by id', () => {
    const result = addUserCorporateLlmEndpoint({ baseUrl: 'https://llm.mine/v1', api: 'openai' })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    removeUserCorporateLlmEndpoint(result.endpoint.id)
    expect(readUserCorporateLlmEndpoints()).toEqual([])
    expect(isUserCorporateLlmEndpoint(result.endpoint.id)).toBe(false)
  })
})
